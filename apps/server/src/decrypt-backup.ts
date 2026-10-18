/**
 * Turns an encrypted backup (`caime-….dump.enc`, M16 B5) back into a dump for `pg_restore`:
 *
 *   BACKUP_KEY=… node dist/decrypt-backup.js caime-2026-10-18T03-00-00-000Z.dump.enc out.dump
 *
 * (`pnpm --filter @caime/server decrypt-backup …` from a checkout). The key is read from the
 * environment, never an argument: a command line is seen by anyone on the box and kept in a
 * shell's history. A file that isn't one of ours, was made with another key, or was changed is
 * refused and leaves nothing behind.
 */
import { BackupUnreadable, decryptFile } from './lib/backup-crypt';
import { key32 } from './lib/vault';

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error('Usage: BACKUP_KEY=… node dist/decrypt-backup.js <backup.dump.enc> <out.dump>');
  process.exit(2);
}
const key = key32(process.env.BACKUP_KEY);
if (!key) {
  console.error('BACKUP_KEY must be the 32 bytes (base64) the backups were made with.');
  process.exit(2);
}
try {
  await decryptFile(key, from, to);
  console.log(`Decrypted into ${to}: restore it with pg_restore (docs/DEPLOY.md, "Backups").`);
} catch (err) {
  console.error(
    err instanceof BackupUnreadable ? err.message : `Not decrypted: ${(err as Error).message}`,
  );
  process.exit(1);
}
