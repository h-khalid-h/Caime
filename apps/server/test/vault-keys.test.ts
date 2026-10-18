/**
 * The vault key apart from what it seals (M16 B5, review 2026-10-17 §5 H1): with VAULT_KEY set,
 * connected accounts' refresh tokens are sealed with it and name it by id; what the database's own
 * key sealed opens with that key and moves to the environment's as it's used, at start and by the
 * daily pass, which then deletes the database's key; a key replaced moves the same way through
 * VAULT_KEY_PREVIOUS; a key gone opens nothing; and /metrics says where things stand.
 */
import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { failingNames } from '../src/check-env';
import { loadConfig } from '../src/config';
import { openRefresh, refreshLabel } from '../src/lib/connected-accounts';
import { runDueJobs } from '../src/lib/jobs';
import { storedServerKey } from '../src/lib/server-keys';
import { DATABASE_VAULT_KEY, sealSecret, vaultKid } from '../src/lib/vault-keys';
import { resealVault, startVaultReseal } from '../src/lib/vault-reseal';
import { createTestApp, signup, type TestApp } from './helpers';

const METRICS = 'metrics-token-for-the-vault-test-0123456789';
let t: TestApp;
let userId: string;
const k1 = randomBytes(32);
const k2 = randomBytes(32);
const ids: Record<string, string> = {};

const useKeys = (current: Buffer | null, previous: Buffer | null = null) => {
  t.ctx.config.vaultKeys = current ? { current, previous } : null;
};
/** A connection whose refresh token is `refresh`, sealed as the server seals one now. */
const connection = async (refresh: string) => {
  const id = uuidv7();
  const { sealed, kid } = await sealSecret(t.ctx, Buffer.from(refresh), refreshLabel(id));
  await t.ctx.db
    .insertInto('connected_accounts')
    .values({
      id,
      user_id: userId,
      provider: 'google',
      subject: `sub-${refresh}`,
      email: null,
      uses: ['calendar'],
      scopes: [],
      refresh_sealed: sealed,
      refresh_kid: kid,
      state: 'connected',
    })
    .execute();
  ids[refresh] = id;
  return id;
};
const rowOf = (refresh: string) =>
  t.ctx.db
    .selectFrom('connected_accounts')
    .select(['id', 'refresh_sealed', 'refresh_kid'])
    .where('id', '=', ids[refresh] as string)
    .executeTakeFirstOrThrow();
const opened = async (refresh: string) =>
  (await openRefresh(t.ctx, await rowOf(refresh)))?.toString() ?? null;
const databaseKey = () => storedServerKey(t.ctx, DATABASE_VAULT_KEY);
const scrape = async () =>
  (await t.app.inject({ url: '/metrics', headers: { authorization: `Bearer ${METRICS}` } })).body;

beforeAll(async () => {
  t = await createTestApp({ METRICS_TOKEN: METRICS });
  userId = (await signup(t, { displayName: 'Noor Vault' })).user.id;
});
afterAll(async () => {
  await t.close();
});

describe('the vault key apart from what it seals (M16 B5)', () => {
  it('without VAULT_KEY, the database’s own key seals as before, and /metrics says so', async () => {
    useKeys(null);
    await connection('r-alpha');
    expect((await rowOf('r-alpha')).refresh_kid).toBeNull();
    expect(await databaseKey()).not.toBeNull();
    expect(await opened('r-alpha')).toBe('r-alpha');
    expect(await resealVault(t.ctx)).toMatchObject({
      sealing: 1,
      older: 0,
      unopenable: 0,
      databaseKey: true,
    });
    const m = await scrape();
    expect(m).toMatch(/^caime_vault_key_external 0$/m);
    expect(m).toMatch(/^caime_vault_database_key 1$/m);
    expect(m).toMatch(/^caime_vault_sealed\{key="sealing"\} 1$/m);
  });

  it('with VAULT_KEY, new tokens are sealed with it; older ones move as they’re used and by the pass, and the database’s key goes', async () => {
    useKeys(k1);
    await connection('r-beta');
    expect((await rowOf('r-beta')).refresh_kid).toBe(vaultKid(k1));
    // Sealed with the database's key, it opens with it and is sealed again with VAULT_KEY.
    const before = await rowOf('r-alpha');
    expect(await opened('r-alpha')).toBe('r-alpha');
    const after = await rowOf('r-alpha');
    expect(after.refresh_kid).toBe(vaultKid(k1));
    expect(Buffer.from(after.refresh_sealed).equals(Buffer.from(before.refresh_sealed))).toBe(
      false,
    );
    expect(Buffer.from(after.refresh_sealed).toString()).not.toContain('r-alpha');
    // One sealed meanwhile by an instance still running without it (a deploy's old container).
    useKeys(null);
    await connection('r-gamma');
    useKeys(k1);
    expect(await resealVault(t.ctx)).toMatchObject({
      sealing: 3,
      older: 0,
      unopenable: 0,
      databaseKey: false,
    });
    expect((await rowOf('r-gamma')).refresh_kid).toBe(vaultKid(k1));
    // Nothing in the database opens them any more; the environment's key opens each.
    expect(await databaseKey()).toBeNull();
    expect([await opened('r-alpha'), await opened('r-beta'), await opened('r-gamma')]).toEqual([
      'r-alpha',
      'r-beta',
      'r-gamma',
    ]);
    // Opening never makes the database's key again.
    expect(await databaseKey()).toBeNull();
    const m = await scrape();
    expect(m).toMatch(/^caime_vault_key_external 1$/m);
    expect(m).toMatch(/^caime_vault_database_key 0$/m);
    expect(m).toMatch(/^caime_vault_sealed\{key="sealing"\} 3$/m);
  });

  it('a key replaced moves the same way through VAULT_KEY_PREVIOUS, and at start', async () => {
    useKeys(k2, k1);
    expect(await opened('r-alpha')).toBe('r-alpha');
    expect((await rowOf('r-alpha')).refresh_kid).toBe(vaultKid(k2));
    // The rest are queued to move once, at start, whichever instance.
    await startVaultReseal(t.ctx);
    await startVaultReseal(t.ctx);
    const queued = await t.ctx.db
      .selectFrom('jobs')
      .select('id')
      .where('kind', '=', 'vault.reseal')
      .execute();
    expect(queued).toHaveLength(1);
    await runDueJobs(t.ctx);
    for (const r of ['r-alpha', 'r-beta', 'r-gamma'])
      expect((await rowOf(r)).refresh_kid).toBe(vaultKid(k2));
    // Nothing left to move: nothing more is queued.
    await startVaultReseal(t.ctx);
    expect(
      await t.ctx.db.selectFrom('jobs').select('id').where('kind', '=', 'vault.reseal').execute(),
    ).toHaveLength(1);
  });

  it('a key gone opens nothing, and the pass says how many must be connected again', async () => {
    useKeys(randomBytes(32));
    expect(await opened('r-alpha')).toBeNull();
    expect(await resealVault(t.ctx)).toMatchObject({
      sealing: 0,
      older: 0,
      unopenable: 3,
      databaseKey: false,
    });
    expect(await databaseKey()).toBeNull();
    expect(await scrape()).toMatch(/^caime_vault_sealed\{key="unopenable"\} 3$/m);
    useKeys(k2);
    expect(await opened('r-beta')).toBe('r-beta');
  });

  it('takes a key as 32 random bytes in base64, a previous key only beside one, and names, never values', async () => {
    const env = { DATABASE_URL: 'postgres://localhost/caime' };
    expect(loadConfig(env)).toMatchObject({ vaultKeys: null, backupKey: null });
    const padded = loadConfig({ ...env, VAULT_KEY: k1.toString('base64') });
    expect(padded.vaultKeys?.current.equals(k1)).toBe(true);
    const url = loadConfig({
      ...env,
      VAULT_KEY: k2.toString('base64url'),
      VAULT_KEY_PREVIOUS: k1.toString('base64'),
      BACKUP_KEY: k1.toString('base64url'),
    });
    expect(url.vaultKeys?.current.equals(k2)).toBe(true);
    expect(url.vaultKeys?.previous?.equals(k1)).toBe(true);
    expect(url.backupKey?.equals(k1)).toBe(true);
    const short = randomBytes(16).toString('base64');
    expect(() => loadConfig({ ...env, VAULT_KEY: short })).toThrow(/VAULT_KEY: 32 random bytes/);
    expect(() => loadConfig({ ...env, BACKUP_KEY: 'not a key' })).toThrow(/BACKUP_KEY/);
    expect(() => loadConfig({ ...env, VAULT_KEY_PREVIOUS: k1.toString('base64') })).toThrow(
      /VAULT_KEY_PREVIOUS: only beside a VAULT_KEY/,
    );
    expect(failingNames({ ...env, VAULT_KEY: short, BACKUP_KEY: short })).toEqual([
      'BACKUP_KEY',
      'VAULT_KEY',
    ]);
    expect(failingNames({ ...env, VAULT_KEY_PREVIOUS: k1.toString('base64') })).toEqual([
      'VAULT_KEY_PREVIOUS',
    ]);
  });
});
