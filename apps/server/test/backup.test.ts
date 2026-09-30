import { readdir, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backupDir, backupDue, runBackup } from '../src/lib/backup';
import { createTestApp, signup, type TestApp } from './helpers';

const ADMIN = 'operator-token-for-the-backup-test-0123456789';
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN, BACKUP_ENABLED: 'true', BACKUP_KEEP_DAYS: '30' });
  await signup(t, { displayName: 'Backed Up' });
});
afterAll(async () => {
  await t.close();
});

const admin = (method: 'GET' | 'POST') =>
  t.app.inject({ method, url: '/v1/admin/backups', headers: { authorization: `Bearer ${ADMIN}` } });

describe('database backups (REVIEW-2026-09, P0)', () => {
  it('the operator makes one: a dump that lists its tables, remembered for /metrics', async () => {
    expect((await t.app.inject({ method: 'POST', url: '/v1/admin/backups' })).statusCode).toBe(401);
    expect(await backupDue(t.ctx)).toBe(true);
    const made = await admin('POST');
    expect(made.statusCode).toBe(200);
    const { backup } = made.json();
    expect(backup.file).toMatch(/^caime-2026-09-23T14-00-00-000Z\.dump$/);
    expect(backup.bytes).toBeGreaterThan(1000);
    expect(backup.at).toBe('2026-09-23T14:00:00.000Z');
    const onDisk = await stat(join(backupDir(t.ctx), backup.file));
    expect(onDisk.size).toBe(backup.bytes);
    // Listed, and the last one remembered in the database, which every instance reads.
    const listed = (await admin('GET')).json();
    expect(listed).toMatchObject({ enabled: true, keepDays: 30, last: backup });
    expect(listed.files.map((f: any) => f.file)).toEqual([backup.file]);
    expect(await backupDue(t.ctx)).toBe(false);
    // Nothing in the dump's name or the log line is the connection string.
    expect(backup.file).not.toContain('postgres');
  });

  it('metrics say when the last one succeeded and how big it was', async () => {
    const stub = await createTestApp({ METRICS_TOKEN: 'metrics-token-for-the-backup-test-01234' });
    try {
      const scraped = await stub.app.inject({
        url: '/metrics',
        headers: { authorization: 'Bearer metrics-token-for-the-backup-test-01234' },
      });
      // The holder is the process's: the backup above is what it remembers.
      expect(scraped.body).toMatch(/^caime_backup_last_success_timestamp_seconds 1790172000$/m);
      expect(scraped.body).toMatch(/^caime_backup_bytes [1-9]\d{3,}$/m);
    } finally {
      await stub.close();
    }
  });

  it('keeps thirty days of them, forgets older ones and dumps that died halfway', async () => {
    const dir = backupDir(t.ctx);
    const old = join(dir, 'caime-2026-08-01T03-00-00-000Z.dump');
    const stale = join(dir, 'caime-2026-09-23T02-00-00-000Z.dump.part');
    await writeFile(old, 'old');
    await utimes(old, new Date('2026-08-01T03:00:00Z'), new Date('2026-08-01T03:00:00Z'));
    await writeFile(stale, 'half');
    await utimes(stale, new Date('2026-09-23T02:00:00Z'), new Date('2026-09-23T02:00:00Z'));
    t.clock.advance(23 * 3_600_000);
    expect(await backupDue(t.ctx)).toBe(true);
    const again = await runBackup(t.ctx);
    expect(again?.file).toBe('caime-2026-09-24T13-00-00-000Z.dump');
    const names = (await readdir(dir)).sort();
    expect(names).toEqual([
      'caime-2026-09-23T14-00-00-000Z.dump',
      'caime-2026-09-24T13-00-00-000Z.dump',
    ]);
  });
});
