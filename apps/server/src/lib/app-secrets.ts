/**
 * An app's webhook secrets, sealed (M16 G1): a secret signs every delivery to the app's address,
 * so whoever reads one can speak to that app as Caime. Each is sealed by the vault's key
 * (`lib/vault-keys.ts`: VAULT_KEY, else the database's own) under a label naming its app, so it
 * opens for that app alone, and a replaced one moves to `previous` as it is. Nothing keeps one in
 * clear (G1b, G1c: the copies the releases before kept beside them were emptied by migration 0134
 * and their columns dropped by 0136). The vault's pass (`resealAppSecrets`) moves them to the key
 * that seals now, and forgets a replaced one past its day and a removed app's.
 */
import type { AppContext } from '../context';
import type { OrgApp } from '../db/schema';
import { type Sealed, sealSecret, vaultOpener } from './vault-keys';

type Ctx = Pick<AppContext, 'config' | 'db' | 'now'>;

export const webhookSecretLabel = (appId: string) => `caime app webhook secret v1 ${appId}`;

/** A secret as an app keeps it, sealed (or nothing kept). */
export interface KeptSecret {
  sealed: Buffer | null;
  kid: string | null;
}

export const currentOf = (
  a: Pick<OrgApp, 'webhook_secret_sealed' | 'webhook_secret_kid'>,
): KeptSecret => ({ sealed: a.webhook_secret_sealed, kid: a.webhook_secret_kid });

export const previousOf = (
  a: Pick<OrgApp, 'previous_secret_sealed' | 'previous_secret_kid'>,
): KeptSecret => ({ sealed: a.previous_secret_sealed, kid: a.previous_secret_kid });

/** A secret sealed for its app by the key that seals now. */
export const sealWebhookSecret = (ctx: Ctx, appId: string, secret: string): Promise<Sealed> =>
  sealSecret(ctx, Buffer.from(secret, 'utf8'), webhookSecretLabel(appId));

/** The secret to sign with, opened; null when none is kept or no key here opens it. */
export async function webhookSecretOf(
  ctx: Ctx,
  appId: string,
  kept: KeptSecret,
  open = vaultOpener(ctx),
): Promise<string | null> {
  if (!kept.sealed) return null;
  const opened = await open({ sealed: kept.sealed, kid: kept.kid }, webhookSecretLabel(appId));
  return opened ? opened.plain.toString('utf8') : null;
}

/** The secret being replaced, to sign beside the new one for its day: sealed as it is. */
export const replacedSecret = (was: KeptSecret): Sealed | null =>
  was.sealed ? { sealed: was.sealed, kid: was.kid } : null;

/** Nothing of an app's secrets: what a removed app keeps. */
export const NO_SECRETS = {
  webhook_secret_sealed: null,
  webhook_secret_kid: null,
  previous_secret_sealed: null,
  previous_secret_kid: null,
  previous_secret_until: null,
} as const;

const BATCH = 200;

/** Apps whose secrets are sealed by another key than `sealing`, after `after`, oldest id first. */
export const appsToSeal = (
  ctx: Pick<AppContext, 'db'>,
  sealing: string | null,
  after: string | null,
) => {
  let q = ctx.db
    .selectFrom('org_apps')
    .select([
      'id',
      'webhook_secret_sealed',
      'webhook_secret_kid',
      'previous_secret_sealed',
      'previous_secret_kid',
    ])
    .where('revoked_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb.and([
          eb('webhook_secret_sealed', 'is not', null),
          eb('webhook_secret_kid', 'is distinct from', sealing),
        ]),
        eb.and([
          eb('previous_secret_sealed', 'is not', null),
          eb('previous_secret_kid', 'is distinct from', sealing),
        ]),
      ]),
    )
    .orderBy('id')
    .limit(BATCH);
  if (after) q = q.where('id', '>', after);
  return q.execute();
};

/**
 * One pass over apps' secrets, with `sealing` the id of the key that seals now: a removed app's
 * and a replaced one past its day are forgotten, and each kept secret sealed by another key that
 * opens it is sealed again with that one. Returns what no key here opens, as `app:<id>:<which>`.
 */
export async function resealAppSecrets(ctx: Ctx, sealing: string | null): Promise<Set<string>> {
  await ctx.db
    .updateTable('org_apps')
    .set(NO_SECRETS)
    .where('revoked_at', 'is not', null)
    .where((eb) =>
      eb.or([
        eb('webhook_secret_sealed', 'is not', null),
        eb('previous_secret_sealed', 'is not', null),
      ]),
    )
    .execute();
  await ctx.db
    .updateTable('org_apps')
    .set({ previous_secret_sealed: null, previous_secret_kid: null, previous_secret_until: null })
    .where('previous_secret_until', '<=', ctx.now())
    .execute();

  const open = vaultOpener(ctx);
  const lost = new Set<string>();
  /** A kept secret sealed again with the key that seals now, kept as it is, or lost. */
  const settle = async (appId: string, kept: KeptSecret): Promise<Sealed | 'kept' | 'lost'> => {
    if (!kept.sealed || kept.kid === sealing) return 'kept';
    const label = webhookSecretLabel(appId);
    const was = await open({ sealed: kept.sealed, kid: kept.kid }, label);
    if (!was) return 'lost';
    return sealSecret(ctx, was.plain, label);
  };

  let after: string | null = null;
  for (;;) {
    const rows = await appsToSeal(ctx, sealing, after);
    for (const r of rows) {
      const current = await settle(r.id, currentOf(r));
      const previous = await settle(r.id, previousOf(r));
      if (current === 'lost') lost.add(`app:${r.id}:current`);
      if (previous === 'lost') lost.add(`app:${r.id}:previous`);
      const set = {
        ...(typeof current === 'object'
          ? { webhook_secret_sealed: current.sealed, webhook_secret_kid: current.kid }
          : {}),
        ...(typeof previous === 'object'
          ? { previous_secret_sealed: previous.sealed, previous_secret_kid: previous.kid }
          : {}),
      };
      if (Object.keys(set).length === 0) continue;
      // Unless it was replaced meanwhile: then the replacement sealed its own, with the key now.
      await ctx.db
        .updateTable('org_apps')
        .set(set)
        .where('id', '=', r.id)
        .where('webhook_secret_sealed', 'is not distinct from', r.webhook_secret_sealed)
        .execute();
    }
    const last = rows.at(-1);
    if (rows.length < BATCH || !last) break;
    after = last.id;
  }
  return lost;
}

/** Apps' secrets still sealed with the database's own key, as `app:<id>:<which>`. */
export async function appSecretsOnDatabaseKey(ctx: Pick<AppContext, 'db'>): Promise<string[]> {
  const rows = await ctx.db
    .selectFrom('org_apps')
    .select([
      'id',
      (eb) =>
        eb
          .and([eb('webhook_secret_sealed', 'is not', null), eb('webhook_secret_kid', 'is', null)])
          .as('current'),
      (eb) =>
        eb
          .and([
            eb('previous_secret_sealed', 'is not', null),
            eb('previous_secret_kid', 'is', null),
          ])
          .as('previous'),
    ])
    .where((eb) =>
      eb.or([
        eb.and([eb('webhook_secret_sealed', 'is not', null), eb('webhook_secret_kid', 'is', null)]),
        eb.and([
          eb('previous_secret_sealed', 'is not', null),
          eb('previous_secret_kid', 'is', null),
        ]),
      ]),
    )
    .execute();
  return rows.flatMap((r) => [
    ...(r.current ? [`app:${r.id}:current`] : []),
    ...(r.previous ? [`app:${r.id}:previous`] : []),
  ]);
}
