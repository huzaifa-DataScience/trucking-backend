/** Minimal multer typings for memoryStorage (no @types/multer required at build). */
declare module 'multer' {
  interface StorageEngine {
    _handleFile(
      req: unknown,
      file: unknown,
      callback: (error?: Error | null, info?: Partial<unknown>) => void,
    ): void;
    _removeFile(req: unknown, file: unknown, callback: (error: Error | null) => void): void;
  }

  export function memoryStorage(): StorageEngine;
}
