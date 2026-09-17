import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import type { ReadStream } from 'fs';

export const ALLOWED_UPLOAD_MIMES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export const MAX_BID_ATTACHMENT_BYTES = 10 * 1024 * 1024;
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

  async ensureRoot(): Promise<void> {
    await fs.mkdir(this.getRoot(), { recursive: true });
  }

  relativePathForBid(bidId: number, storedFileName: string): string {
    return join('bidding', String(bidId), storedFileName).replace(/\\/g, '/');
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

  absolutePath(relativePath: string): string {
    return join(this.getRoot(), relativePath);
  }

  storedFileName(originalName: string, mimeType: string): string {
    const ext = ALLOWED_UPLOAD_MIMES[mimeType] ?? this.extFromOriginal(originalName);
    return `${randomUUID()}${ext}`;
  }

  async writeBidFile(
    bidId: number,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<{ storagePath: string; sizeBytes: number }> {
    const storedName = this.storedFileName(originalName, mimeType);
    const storagePath = this.relativePathForBid(bidId, storedName);
    const absolute = this.absolutePath(storagePath);
    await fs.mkdir(dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);
    return { storagePath, sizeBytes: buffer.length };
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
