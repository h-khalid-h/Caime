/**
 * What's sealed with a key that no longer seals moves to the one that does (M16 B5): a
 * connection's refresh token as it's used (`openRefresh`), and every one of them a batch at a
 * time, in the order of their ids, at start (queued once, whichever instance) and daily
 * (`resealVault`). Once nothing the database's own key opens is left, that key is deleted, so no
 * later dump of the database holds it. What's sealed with which key is kept for /metrics
 * (`caime_vault_sealed`, `caime_vault_database_key`), which every instance reads back.
 */
import type { AppContext } from '../context';
import { refreshLabel, resealRefresh } from './connected-accounts';
import { enqueue, registerJob, registerPeriodic } from './jobs';
import { vaultState } from './metrics';
import { dropServerKey, storedServerKey } from './server-keys';
import { writeSetting } from './settings';
import { DATABASE_VAULT_KEY, openSecret, sealingKid } from './vault-keys';

export const VAULT_SETTING = 'vault.state';
const JOB = 'vault.reseal';
const BATCH = 200;
const DAY_MS = 86_400_000;

/** What the last pass found, as /metrics says it. */
export interface VaultState {
  /** Sealed with the key that seals now. */
  sealing: number;
  /** Sealed with another key here that still opens it (moved at the next pass or use). */
  older: number;
  /** Sealed with a key that's gone: its connection asks to be connected again when it's used. */
  unopenable: number;
  /** Whether the database still holds its own key. */
  databaseKey: boolean;
  /** When the pass ran, in milliseconds. */
  at: number;
}

/** Those not sealed with the key that seals now, after `after`, oldest id first. */
const unmoved = (ctx: AppContext, kid: string, after: string | null) => {
  let q = ctx.db
    .selectFrom('connected_accounts')
    .select(['id', 'refresh_sealed', 'refresh_kid'])
    .where((eb) => eb.or([eb('refresh_kid', 'is', null), eb('refresh_kid', '<>', kid)]))
    .orderBy('id')
    .limit(BATCH);
  if (after) q = q.where('id', '>', after);
  return q.execute();
};

/**
 * One pass: with VAULT_KEY set, every value sealed with another key that opens is sealed again
 * with it, and the database's own key goes once nothing it opens is left; without, only counted.
 */
export async function resealVault(ctx: AppContext): Promise<VaultState> {
  const kid = sealingKid(ctx);
  const lost = new Set<string>();
  if (kid !== null) {
    let after: string | null = null;
    for (;;) {
      const rows = await unmoved(ctx, kid, after);
      for (const r of rows) {
        const opened = await openSecret(
          ctx,
          { sealed: r.refresh_sealed, kid: r.refresh_kid },
          refreshLabel(r.id),
        );
        if (opened) await resealRefresh(ctx, r.id, r.refresh_sealed, opened.plain);
        else lost.add(r.id);
      }
      const last = rows.at(-1);
      if (rows.length < BATCH || !last) break;
      after = last.id;
    }
    // Whatever the database's key still seals is only what it can't open (or was sealed by an
    // instance still running without VAULT_KEY, moved at the next pass): the key goes when so.
    const left = await ctx.db
      .selectFrom('connected_accounts')
      .select('id')
      .where('refresh_kid', 'is', null)
      .execute();
    if (left.every((r) => lost.has(r.id))) await dropServerKey(ctx, DATABASE_VAULT_KEY);
  }
  const counts = await ctx.db
    .selectFrom('connected_accounts')
    .select(['refresh_kid', (eb) => eb.fn.countAll<string>().as('n')])
    .groupBy('refresh_kid')
    .execute();
  let sealing = 0;
  let others = 0;
  for (const c of counts)
    if (c.refresh_kid === kid) sealing += Number(c.n);
    else others += Number(c.n);
  // Without VAULT_KEY, nothing sealed under an environment key opens here.
  const unopenable = kid === null ? others : lost.size;
  const state: VaultState = {
    sealing,
    older: Math.max(0, others - unopenable),
    unopenable,
    databaseKey: (await storedServerKey(ctx, DATABASE_VAULT_KEY)) !== null,
    at: ctx.now().getTime(),
  };
  await writeSetting(ctx.db, VAULT_SETTING, state, ctx.now());
  Object.assign(vaultState, state);
  return state;
}

export function registerVaultReseal(): void {
  registerJob(JOB, async (ctx) => {
    await resealVault(ctx);
  });
  registerPeriodic({
    name: JOB,
    everyMs: DAY_MS,
    background: true,
    run: async (ctx) => {
      await resealVault(ctx);
    },
  });
}

/**
 * At start, with VAULT_KEY set: if anything is sealed with another key, or the database still
 * holds its own, a pass is queued once (whichever instance), so a new key takes over that day.
 */
export async function startVaultReseal(ctx: AppContext): Promise<void> {
  const kid = sealingKid(ctx);
  if (kid === null) return;
  const [first] = await unmoved(ctx, kid, null);
  const keyKept = (await storedServerKey(ctx, DATABASE_VAULT_KEY)) !== null;
  if (first || keyKept)
    await enqueue(ctx, JOB, {}, { dedupeKey: `vault:${kid}:${first?.id ?? 'key'}` });
}
