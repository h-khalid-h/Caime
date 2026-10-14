/**
 * Keys the server signs or seals its own short-lived things with (a passkey's sign-in challenge,
 * an account's consent in flight): 32 random bytes each, made once under its name in
 * `server_settings` and read by every instance, so nothing is kept per request.
 */
import { randomBytes } from 'node:crypto';
import type { AppContext } from '../context';

export async function serverKey(ctx: AppContext, name: string): Promise<Buffer> {
  const read = () =>
    ctx.db.selectFrom('server_settings').select('value').where('key', '=', name).executeTakeFirst();
  const stored = await read();
  if (stored) return Buffer.from((stored.value as { key: string }).key, 'base64url');
  await ctx.db
    .insertInto('server_settings')
    .values({ key: name, value: JSON.stringify({ key: randomBytes(32).toString('base64url') }) })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute();
  // Another instance may have made it first: everyone uses the one that was kept.
  const kept = await read();
  if (!kept) throw new Error(`server key ${name} missing`);
  return Buffer.from((kept.value as { key: string }).key, 'base64url');
}
