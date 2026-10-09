import { inflateRawSync } from 'zlib';

export type ZipEntry = { name: string; bytes: Buffer };

/** Files inside a .zip. Skips folders, junk, and methods other than store/deflate. */
export function readZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buf.length) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count && ptr + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8').replace(/\\/g, '/');
    ptr += 46 + nameLen + extraLen + commentLen;
    const base = name.split('/').pop() ?? '';
    if (!base || name.endsWith('/') || name.includes('__MACOSX') || base.startsWith('.')) continue;
    if (localOff + 30 > buf.length) continue;
    const localNameLen = buf.readUInt16LE(localOff + 26);
    const localExtra = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtra;
    if (dataStart + compSize > buf.length) continue;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    let bytes: Buffer | null = null;
    if (method === 0) bytes = Buffer.from(comp);
    else if (method === 8) {
      try {
        bytes = inflateRawSync(comp);
      } catch {
        continue;
      }
    }
    if (bytes) out.push({ name, bytes });
  }
  return out;
}
