import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { lookup as dnsLookup, type LookupAddress } from 'dns';
import * as http from 'http';
import * as https from 'https';
import { isIP } from 'net';
import { basename, extname, isAbsolute, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ALLOWED_UPLOAD_MIMES } from '../files/file-storage.service';

/**
 * Pull a file referenced by a Project document hub link (intake `documentLinks[].url`)
 * so it can land in Drawings without the clerk downloading and re-uploading it.
 *
 * Supported:
 *  - http(s) direct file links, plus share-link rewrites for SharePoint/OneDrive,
 *    Dropbox and Google Drive so they return the file instead of a viewer page.
 *  - O-drive / UNC / file:// paths, only under roots listed in DOC_HUB_FILE_ROOTS.
 * Login-gated portals return HTML; those are rejected with a "download manually" hint.
 */

export type FetchedLinkFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 60_000;

const EXT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_UPLOAD_MIMES).map(([mime, ext]) => [ext, mime]),
);
EXT_TO_MIME['.jpeg'] = 'image/jpeg';

export function isFileSystemLink(raw: string): boolean {
  return /^\\\\/.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw) || /^file:\/\//i.test(raw);
}

export async function fetchDocumentLink(
  rawUrl: string,
  opts: { maxBytes: number; fileRoots: string[] },
): Promise<FetchedLinkFile> {
  const url = rawUrl.trim();
  if (!url) throw new BadRequestException('Link URL is empty');
  if (isFileSystemLink(url)) return readFromFileRoots(url, opts);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Link is not a valid URL or drive path');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException(`Unsupported link protocol: ${parsed.protocol}`);
  }
  return fetchHttp(rewriteShareLink(parsed), opts.maxBytes);
}

/** Share links open a viewer page; these rewrites ask the host for the raw file instead. */
export function rewriteShareLink(u: URL): URL {
  const out = new URL(u.toString());
  const host = out.hostname.toLowerCase();
  if (host.endsWith('sharepoint.com') || host === '1drv.ms' || host.endsWith('onedrive.live.com')) {
    out.searchParams.set('download', '1');
  } else if (host.endsWith('dropbox.com')) {
    out.searchParams.delete('dl');
    out.searchParams.set('dl', '1');
  } else if (host === 'drive.google.com') {
    const m = out.pathname.match(/\/file\/d\/([^/]+)/);
    const id = m?.[1] ?? out.searchParams.get('id');
    if (id) return new URL(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`);
  }
  return out;
}

async function readFromFileRoots(
  raw: string,
  opts: { maxBytes: number; fileRoots: string[] },
): Promise<FetchedLinkFile> {
  if (!opts.fileRoots.length) {
    throw new BadRequestException(
      'Drive / O-drive links are not enabled on this server (DOC_HUB_FILE_ROOTS is not set). Upload the file instead.',
    );
  }
  const path = resolve(/^file:\/\//i.test(raw) ? fileURLToPath(raw) : raw);
  const allowed = opts.fileRoots.some((root) => {
    const rel = relative(resolve(root), path);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  });
  if (!allowed) {
    throw new BadRequestException('That drive path is outside the folders this server may read');
  }
  let stat;
  try {
    stat = await fs.stat(path);
  } catch {
    throw new BadRequestException('File not found at that drive path (or the server cannot reach it)');
  }
  if (!stat.isFile()) throw new BadRequestException('That drive path is a folder, not a file');
  if (stat.size > opts.maxBytes) {
    throw new PayloadTooLargeException(`File exceeds ${opts.maxBytes} bytes`);
  }
  const buffer = await fs.readFile(path);
  const fileName = basename(path);
  return { buffer, fileName, mimeType: resolveMime(null, fileName, buffer) };
}

async function fetchHttp(start: URL, maxBytes: number): Promise<FetchedLinkFile> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await requestOnce(current, maxBytes);
    if (res.kind === 'redirect') {
      const next = new URL(res.location, current);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new BadRequestException('Link redirected to an unsupported protocol');
      }
      current = next;
      continue;
    }
    const contentType = (res.contentType ?? '').split(';')[0].trim().toLowerCase();
    if (contentType === 'text/html') {
      throw new BadRequestException(
        'That link opens a web page (likely a login portal or viewer), not a file. Download it from the portal and upload it in Drawings.',
      );
    }
    const fileName =
      fileNameFromDisposition(res.contentDisposition) ||
      decodeURIComponent(basename(current.pathname)) ||
      'document';
    return { buffer: res.body, fileName, mimeType: resolveMime(contentType, fileName, res.body) };
  }
  throw new BadRequestException('Link redirected too many times');
}

type OnceResult =
  | { kind: 'redirect'; location: string }
  | { kind: 'body'; body: Buffer; contentType?: string; contentDisposition?: string };

function requestOnce(url: URL, maxBytes: number): Promise<OnceResult> {
  // Node skips `lookup` for IP-literal hosts, so check those here.
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal) && isPrivateAddress(literal)) {
    return Promise.reject(new BadRequestException(`Refusing to fetch from non-public address (${literal})`));
  }
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolvePromise, reject) => {
    const req = mod.get(
      url,
      {
        lookup: publicOnlyLookup,
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'User-Agent': 'BidSheet-DocumentImport/1.0', Accept: '*/*' },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          resolvePromise({ kind: 'redirect', location: res.headers.location });
          return;
        }
        if (status === 401 || status === 403) {
          res.resume();
          reject(new BadRequestException('Link requires a login. Download it from the portal and upload it in Drawings.'));
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new BadRequestException(`Link returned HTTP ${status}`));
          return;
        }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy();
          reject(new PayloadTooLargeException(`File exceeds ${maxBytes} bytes`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            res.destroy();
            reject(new PayloadTooLargeException(`File exceeds ${maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolvePromise({
            kind: 'body',
            body: Buffer.concat(chunks),
            contentType: res.headers['content-type'],
            contentDisposition: res.headers['content-disposition'],
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new BadRequestException('Link timed out')));
    req.on('error', (err) =>
      reject(err instanceof BadRequestException ? err : new BadRequestException(`Could not fetch link: ${err.message}`)),
    );
  });
}

/** Resolve DNS ourselves and refuse private ranges, so a link cannot reach internal services (checked per hop, at connect time). */
function publicOnlyLookup(
  hostname: string,
  options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const blocked = addresses.find((a) => isPrivateAddress(a.address));
    if (blocked || !addresses.length) {
      return callback(
        Object.assign(new Error(`Refusing to fetch from non-public address (${hostname})`), { code: 'EBLOCKED' }),
        '',
        0,
      );
    }
    if ((options as { all?: boolean })?.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return low === '::' || low === '::1' || /^f[cd]/.test(low) || /^fe[89ab]/.test(low) || /^ff/.test(low);
  }
  return true;
}

function fileNameFromDisposition(header?: string): string | null {
  if (!header) return null;
  const star = header.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}

/** Prefer a specific Content-Type; fall back to extension, then magic bytes (hosts often send octet-stream). */
function resolveMime(contentType: string | null, fileName: string, body: Buffer): string {
  if (contentType && ALLOWED_UPLOAD_MIMES[contentType]) return contentType;
  const byExt = EXT_TO_MIME[extname(fileName).toLowerCase()];
  if (byExt) return byExt;
  if (body.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (body[0] === 0xff && body[1] === 0xd8) return 'image/jpeg';
  if (body.subarray(0, 4).toString('latin1') === '\x89PNG') return 'image/png';
  return contentType || 'application/octet-stream';
}
