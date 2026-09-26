/**
 * File storage (ADR-13). Local disk under DATA_DIR by default — mount a volume there in
 * production. Keys are opaque; nothing user-controlled reaches a filesystem path.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface Storage {
  write(key: string, source: Readable): Promise<number>;
  append(key: string, source: Readable): Promise<number>;
  read(key: string, range?: { start: number; end: number }): Readable;
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
  path(key: string): string;
  moveFrom(tempKey: string, key: string): Promise<void>;
}

export function diskStorage(root: string): Storage {
  const full = (key: string) => {
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('bad storage key');
    return join(root, key);
  };
  return {
    async write(key, source) {
      const p = full(key);
      await mkdir(dirname(p), { recursive: true });
      await pipeline(source, createWriteStream(p));
      return (await stat(p)).size;
    },
    async append(key, source) {
      const p = full(key);
      await mkdir(dirname(p), { recursive: true });
      await pipeline(source, createWriteStream(p, { flags: 'a' }));
      return (await stat(p)).size;
    },
    read(key, range) {
      return createReadStream(full(key), range);
    },
    async size(key) {
      try {
        return (await stat(full(key))).size;
      } catch {
        return null;
      }
    },
    async remove(key) {
      await rm(full(key), { force: true });
    },
    path: full,
    async moveFrom(tempKey, key) {
      const dest = full(key);
      await mkdir(dirname(dest), { recursive: true });
      await rename(full(tempKey), dest);
    },
  };
}
