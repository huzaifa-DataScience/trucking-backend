import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { randomUUID } from 'crypto';
import type { ReadStream } from 'fs';

export const ALLOWED_UPLOAD_MIMES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

export const MAX_BID_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MAX_BID_ATTACHMENTS_PER_BID = 20;
export const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

@Injectable()
export class FileStorageService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRoot();
  }

  getRoot(): string {
    const raw = this.config.get<string>('UPLOAD_ROOT', './uploads')?.trim() || './uploads';
    return raw;
  }

  /** Network drive root for per-project document folders (bid attachments) — see writeBidFile. */
  getProjectDocsRoot(): string {
    const raw = this.config.get<string>('PROJECT_DOCS_ROOT', 'N:\\')?.trim() || 'N:\\';
    return raw;
  }

  async ensureRoot(): Promise<void> {
    await fs.mkdir(this.getRoot(), { recursive: true });
    // Not ensured eagerly: getProjectDocsRoot() is a network share that may not be
    // mapped in every environment (e.g. local dev) — only touched lazily on upload,
    // so a missing/unmapped N drive doesn't block the whole app from starting.
  }

  /** Strip characters Windows folder/file names can't contain, trim trailing dots/spaces. */
  private sanitizeFolderName(name: string): string {
    const cleaned = name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '');
    return cleaned.slice(0, 150) || 'Untitled';
  }

  /** One folder per project, named "{Estimate #} - {Project name}" so it's both human-readable and collision-proof. */
  projectFolderName(estimateNumber: string | null, bidName: string | null): string {
    const est = this.sanitizeFolderName(estimateNumber?.trim() || 'Unknown');
    const name = bidName?.trim() ? this.sanitizeFolderName(bidName) : null;
    return name ? `${est} - ${name}` : est;
  }

  relativePathForAvatar(userId: number, mimeType: string): string {
    const ext = ALLOWED_UPLOAD_MIMES[mimeType] ?? '.jpg';
    return join('avatars', `${userId}${ext}`).replace(/\\/g, '/');
  }

  async writeAvatar(userId: number, buffer: Buffer, mimeType: string): Promise<string> {
    const storagePath = this.relativePathForAvatar(userId, mimeType);
    const absolute = this.absolutePath(storagePath);
    await fs.mkdir(dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);
    return storagePath;
  }

  /** Bid attachment storagePaths are stored as full absolute paths (N drive, project-named
   *  folder) and pass through unchanged; older/avatar paths stay relative to getRoot(). */
  absolutePath(relativePath: string): string {
    if (isAbsolute(relativePath)) return relativePath;
    return join(this.getRoot(), relativePath);
  }

  storedFileName(originalName: string, mimeType: string): string {
    const ext = ALLOWED_UPLOAD_MIMES[mimeType] ?? this.extFromOriginal(originalName);
    return `${randomUUID()}${ext}`;
  }

  /** Each bid's documents land in their own project-named folder on the shared N drive. */
  async writeBidFile(
    estimateNumber: string | null,
    bidName: string | null,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<{ storagePath: string; sizeBytes: number }> {
    const storedName = this.storedFileName(originalName, mimeType);
    const folder = this.projectFolderName(estimateNumber, bidName);
    const absolute = join(this.getProjectDocsRoot(), folder, storedName);
    await fs.mkdir(dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);
    return { storagePath: absolute, sizeBytes: buffer.length };
  }

  openReadStream(relativePath: string): ReadStream {
    return createReadStream(this.absolutePath(relativePath));
  }

  /** Check before streaming — `createReadStream` only fails asynchronously on the stream itself, which NestJS logs as a raw unhandled error instead of a clean 404. */
  async fileExists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.absolutePath(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(relativePath: string): Promise<void> {
    try {
      await fs.unlink(this.absolutePath(relativePath));
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
    }
  }

  private extFromOriginal(name: string): string {
    const m = name.match(/(\.[a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : '';
  }
}
