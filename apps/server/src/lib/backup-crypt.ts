/**
 * A backup encrypted before it's kept or copied off the host (M16 B5, `BACKUP_KEY`): AES-256-GCM
 * over the whole dump, streamed both ways, never read whole into memory. Layout: `CAIMEBK1` (8) |
 * the key's id (9, `keyId`) | nonce (12) | body | tag (16); the magic and the key's id are
 * authenticated with the body. Decrypting writes beside the target and renames only once the tag
 * holds, so a changed or cut file leaves nothing that looks like a dump.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { keyId } from './vault';

/** An encrypted backup's name ends with this after the dump's own `.dump`. */
export const ENCRYPTED = '.enc';
const MAGIC = Buffer.from('CAIMEBK1');
const KID = 9;
const NONCE = 12;
const TAG = 16;
const HEAD = MAGIC.length + KID + NONCE;

/** `from` encrypted into `to` with `key` (32 bytes). */
export async function encryptFile(key: Buffer, from: string, to: string): Promise<void> {
  const kid = keyId('backup', key);
  const nonce = randomBytes(NONCE);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.concat([MAGIC, kid]));
  await pipeline(
    createReadStream(from),
    cipher,
    async function* (body: AsyncIterable<Buffer>) {
      yield Buffer.concat([MAGIC, kid, nonce]);
      for await (const chunk of body) yield chunk;
      // The cipher's output has been read through, so it has finished: its tag is final.
      yield cipher.getAuthTag();
    },
    createWriteStream(to),
  );
}

/** Why a file isn't decrypted: not one of ours, made with another key, or changed since. */
export class BackupUnreadable extends Error {}

interface Parts {
  size: number;
  kid: Buffer;
  nonce: Buffer;
  tag: Buffer;
}

async function partsOf(file: string): Promise<Parts> {
  const { size } = await stat(file);
  const notOurs = () => new BackupUnreadable('Not an encrypted Caime backup.');
  if (size < HEAD + TAG) throw notOurs();
  const handle = await open(file, 'r');
  const head = Buffer.alloc(HEAD);
  const tag = Buffer.alloc(TAG);
  try {
    await handle.read(head, 0, HEAD, 0);
    await handle.read(tag, 0, TAG, size - TAG);
  } finally {
    await handle.close();
  }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw notOurs();
  return {
    size,
    kid: head.subarray(MAGIC.length, MAGIC.length + KID),
    nonce: head.subarray(MAGIC.length + KID),
    tag,
  };
}

/** The body run through the decipher into `sink`; throws once the tag doesn't hold. */
async function decryptInto(key: Buffer, file: string, sink: Writable): Promise<void> {
  const p = await partsOf(file);
  const mine = keyId('backup', key);
  if (!p.kid.equals(mine))
    throw new BackupUnreadable(
      `Made with another key (its id ${p.kid.toString('base64url')}; this key's is ${mine.toString('base64url')}).`,
    );
  const decipher = createDecipheriv('aes-256-gcm', key, p.nonce);
  decipher.setAAD(Buffer.concat([MAGIC, p.kid]));
  decipher.setAuthTag(p.tag);
  try {
    await pipeline(createReadStream(file, { start: HEAD, end: p.size - TAG - 1 }), decipher, sink);
  } catch (err) {
    if (err instanceof BackupUnreadable) throw err;
    throw new BackupUnreadable('Changed or cut since it was made: it doesn’t decrypt.');
  }
}

/** `from` decrypted into `to`; throws, leaving no `to`, when it isn't ours, its key's, or whole. */
export async function decryptFile(key: Buffer, from: string, to: string): Promise<void> {
  const part = `${to}.part`;
  try {
    await decryptInto(key, from, createWriteStream(part));
  } catch (err) {
    await rm(part, { force: true });
    throw err;
  }
  await rename(part, to);
}

/** Whether `file` decrypts whole with `key`, read through and written nowhere (throws if not). */
export async function checkEncrypted(key: Buffer, file: string): Promise<void> {
  await decryptInto(
    key,
    file,
    new Writable({
      write(_chunk, _enc, done) {
        done();
      },
    }),
  );
}
