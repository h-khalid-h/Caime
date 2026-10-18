/**
 * The keys a third party's credential kept for someone is sealed with (M16 B5, review 2026-10-17
 * §5 H1): `VAULT_KEY` from the environment, never kept beside what it seals, so a dump of the
 * database holds sealed tokens and nothing that opens them. Each sealed value names the key that
 * sealed it by id (`vaultKid`: a fingerprint, never the key), so a key is replaced by setting the
 * new one as VAULT_KEY and the old one as VAULT_KEY_PREVIOUS until nothing is left sealed with it
 * (`lib/vault-reseal.ts` moves each value as it's used, at start and daily, and counts what's
 * left on each key). Without VAULT_KEY the database's own key (`accounts.vault` in
 * `server_settings`) seals, as before; once VAULT_KEY is set and nothing that key opens is left,
 * it's deleted.
 */
import type { AppContext } from '../context';
import { serverKey, storedServerKey } from './server-keys';
import { keyId, seal, unseal } from './vault';

/** The database's own key, made when nothing else seals and deleted once VAULT_KEY took over. */
export const DATABASE_VAULT_KEY = 'accounts.vault';

export const vaultKid = (key: Buffer): string => keyId('vault', key).toString('base64url');

/** A sealed value and the id of the key that sealed it (null: the database's own). */
export interface Sealed {
  sealed: Buffer;
  kid: string | null;
}

type Ctx = Pick<AppContext, 'config' | 'db'>;

/** The id new values are sealed under: VAULT_KEY's, else null for the database's own key. */
export const sealingKid = (ctx: Pick<AppContext, 'config'>): string | null =>
  ctx.config.vaultKeys ? vaultKid(ctx.config.vaultKeys.current) : null;

/** Sealed with the key that seals now: VAULT_KEY, else the database's own (made the first time). */
export async function sealSecret(ctx: Ctx, plain: Buffer, label: string): Promise<Sealed> {
  const env = ctx.config.vaultKeys;
  if (env) return { sealed: seal(env.current, plain, label), kid: vaultKid(env.current) };
  return { sealed: seal(await serverKey(ctx, DATABASE_VAULT_KEY), plain, label), kid: null };
}

/** The key a value sealed under `kid` opens with, or null when that key is gone. */
async function keyFor(ctx: Ctx, kid: string | null): Promise<Buffer | null> {
  if (kid === null) return storedServerKey(ctx, DATABASE_VAULT_KEY);
  const env = ctx.config.vaultKeys;
  if (!env) return null;
  for (const key of [env.current, env.previous]) if (key && vaultKid(key) === kid) return key;
  return null;
}

/**
 * The value opened, or null when its key is gone or its bytes were changed; `stale` when the key
 * that seals now isn't the one that sealed it, so whoever opened it may seal it again.
 */
export async function openSecret(
  ctx: Ctx,
  value: Sealed,
  label: string,
): Promise<{ plain: Buffer; stale: boolean } | null> {
  const key = await keyFor(ctx, value.kid);
  const plain = key ? unseal(key, value.sealed, label) : null;
  if (!plain) return null;
  return { plain, stale: value.kid !== sealingKid(ctx) };
}
