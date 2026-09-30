/**
 * Database backups (docs/REVIEW-2026-09.md, P0): a worker instance dumps the database with
 * `pg_dump` (custom format, compressed) into BACKUP_DIR every BACKUP_EVERY_HOURS, checks the dump
 * reads back with `pg_restore --list`, keeps BACKUP_KEEP_DAYS of them, and remembers the last
 * one in `server_settings` so every instance's /metrics says how old it is
 * (`caime_backup_last_success_timestamp_seconds`). The hourly task takes an advisory lock, so
 * two worker instances never dump at once, and dumps only when the last one is due.
 *
 * What this is not: an off-box copy. BACKUP_DIR is on the data volume, beside uploads; the
 * volume's own backup (EasyPanel's, or S3 when that adapter lands) is what survives the box.
 */
import { execFile } from 'node:child_process';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { registerPeriodic } from './jobs';
import { backupState } from './metrics';

const run = promisify(execFile);
const SETTING = 'backup.last';
const PREFIX = 'caime-';
const SUFFIX = '.dump';

export interface BackupRecord {
  file: string;
  bytes: number;
  /** ISO time. */
  at: string;
}

export function backupDir(ctx: AppContext): string {
  return ctx.config.BACKUP_DIR ?? join(ctx.config.DATA_DIR, 'backups');
}

/** The last backup that succeeded, as the database remembers it (any instance's). */
export async function lastBackup(ctx: AppContext): Promise<BackupRecord | null> {
  const row = await ctx.db
    .selectFrom('server_settings')
    .select('value')
    .where('key', '=', SETTING)
    .executeTakeFirst();
  const last = (row?.value as BackupRecord | undefined) ?? null;
  if (last) {
    backupState.at = Date.parse(last.at);
    backupState.bytes = last.bytes;
  }
  return last;
}

/** The backups on this instance's disk, newest first. */
export async function listBackups(ctx: AppContext): Promise<BackupRecord[]> {
  const dir = backupDir(ctx);
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: BackupRecord[] = [];
  for (const name of names) {
    if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) continue;
    const s = await stat(join(dir, name)).catch(() => null);
    if (s) out.push({ file: name, bytes: s.size, at: s.mtime.toISOString() });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Dump the database now, check it, keep it, and forget the ones past their days. Returns what was
 * made, or null when another instance holds the lock (its backup counts).
 */
export async function runBackup(ctx: AppContext): Promise<BackupRecord | null> {
  const dir = backupDir(ctx);
  await mkdir(dir, { recursive: true });
  return ctx.db.transaction().execute(async (trx) => {
    const { locked } = await sql<{ locked: boolean }>`
      select pg_try_advisory_xact_lock(hashtext('caime-backup')) as locked
    `
      .execute(trx)
      .then((r) => r.rows[0] ?? { locked: false });
    if (!locked) return null;
    const now = ctx.now();
    const file = `${PREFIX}${now.toISOString().replace(/[:.]/g, '-')}${SUFFIX}`;
    const path = join(dir, file);
    const part = `${path}.part`;
    // Custom format is compressed and restores selectively; no owners or grants, so it restores
    // into any role. The connection string is an argument, never in the log.
    await run('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--file=${part}`,
      ctx.config.DATABASE_URL,
    ]);
    // A dump that can't be listed can't be restored: it's thrown away, and the failure logged.
    const listed = await run('pg_restore', ['--list', part]);
    if (!/TABLE DATA/.test(listed.stdout)) {
      await rm(part, { force: true });
      throw new Error('The backup lists no table data.');
    }
    await rename(part, path);
    const { size } = await stat(path);
    const record: BackupRecord = { file, bytes: size, at: now.toISOString() };
    await trx
      .insertInto('server_settings')
      .values({ key: SETTING, value: JSON.stringify(record) })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({ value: JSON.stringify(record), updated_at: now }),
      )
      .execute();
    backupState.at = now.getTime();
    backupState.bytes = size;
    await forgetOld(ctx, dir, now);
    ctx.log.info({ file, bytes: size }, 'database backed up');
    return record;
  });
}

async function forgetOld(ctx: AppContext, dir: string, now: Date): Promise<void> {
  const cutoff = now.getTime() - ctx.config.BACKUP_KEEP_DAYS * 86_400_000;
  for (const b of await listBackups(ctx)) {
    if (Date.parse(b.at) < cutoff) await rm(join(dir, b.file), { force: true });
  }
  // A dump that died halfway leaves a .part: gone once it's plainly not in progress.
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!name.endsWith('.part')) continue;
    const s = await stat(join(dir, name)).catch(() => null);
    if (s && now.getTime() - s.mtimeMs > 6 * 3_600_000) await rm(join(dir, name), { force: true });
  }
}

/** Whether the next backup is due: none yet, or the last older than the interval, less an hour. */
export async function backupDue(ctx: AppContext): Promise<boolean> {
  const last = await lastBackup(ctx);
  if (!last) return true;
  const every = ctx.config.BACKUP_EVERY_HOURS * 3_600_000;
  return ctx.now().getTime() - Date.parse(last.at) >= every - 3_600_000;
}

/** Hourly: the last backup's age for /metrics, and a new one when it's due. */
export function registerBackupJob(): void {
  registerPeriodic({
    name: 'backup',
    everyMs: 3_600_000,
    background: true,
    run: async (ctx) => {
      if (!ctx.config.BACKUP_ENABLED) return;
      if (await backupDue(ctx)) await runBackup(ctx);
    },
  });
}
