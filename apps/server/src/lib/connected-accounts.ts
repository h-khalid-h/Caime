/**
 * A person's Google or Microsoft account, connected for the uses they turn on (R90). The
 * consent is the pipeline R89's contacts use (`lib/provider-consent.ts`: one client per provider,
 * registered with both return addresses). Unlike R89's one hour, a connection renews itself: its
 * refresh token is sealed with a server key, bound to the connection's id (`lib/vault.ts`), and
 * the access it renews lives in memory only, never in a row or a log.
 *
 * The consent returns through the provider to a browser that may not hold the person's session
 * (a phone opens it in the system's), so the return finishes nothing by itself: it trades the
 * one-time code, seals what came back into a claim (ten minutes, the server's key, the person
 * who asked inside it) and hands that to the app in the fragment of the address it lands on. The
 * app redeems it signed in, and only the person who asked can: someone who sends another their
 * consent link never gets the other's account.
 */

import { uuidv4, uuidv7 } from '@caime/core';
import {
  ACCOUNT_PROVIDER_NAMES,
  ACCOUNT_RETURN_PATH,
  type AccountFailure,
  type AccountProvider,
  type AccountReturnError,
  type AccountRunningUse,
  type AccountUse,
  accountScopes,
  readsEveryCalendar,
  usesGranted,
} from '@caime/core/accounts';
import type { AccountUseHealthView, ConnectedAccountView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { type Selectable, sql, type Updateable } from 'kysely';
import type { AppContext } from '../context';
import type { ConnectedAccountsTable } from '../db/schema';
import { withdrawPlans } from './calendar-push';
import { AppError, badRequest, notFound } from './errors';
import { ACCOUNTS_SETTING, accountsState } from './metrics';
import { notify } from './notify';
import {
  CONSENT_MS,
  consentLink,
  landingFor,
  openState,
  PROVIDER_MS,
  postForm,
  providerClient,
  providersOn,
  refusedAs,
  sealState,
  spendTicket,
  tradeCode,
} from './provider-consent';
import { serverKey } from './server-keys';
import { writeSetting } from './settings';
import { TtlCache } from './ttl-cache';
import { openSecret, sealSecret } from './vault-keys';

/** A connection as every reader takes it: with how each use last went (M16 G2). */
export const ACCOUNT_ROW = [
  'id',
  'user_id',
  'provider',
  'email',
  'uses',
  'scopes',
  'state',
  'refresh_sealed',
  'refresh_kid',
  'created_at',
  'synced_at',
  'pushed_at',
  'read_failure',
  'read_failed_at',
  'push_failure',
  'push_failed_at',
  'rest_until',
] as const;
export type AccountRow = Pick<Selectable<ConnectedAccountsTable>, (typeof ACCOUNT_ROW)[number]>;
type Row = AccountRow;

export function accountsOffered(ctx: Pick<AppContext, 'config'>): AccountProvider[] {
  return providersOn(ctx.config);
}

/** Where the provider returns: the address each client is registered with, beside R89's. */
export function accountRedirectUri(ctx: Pick<AppContext, 'config'>, p: AccountProvider): string {
  return `${ctx.config.PUBLIC_URL}/v1/accounts/${p}/back`;
}

interface Asked {
  /** Who asked. */
  u: string;
  uses: AccountUse[];
  b: 'web' | 'app';
  /** Until when, in milliseconds. */
  e: number;
}

interface Claim {
  u: string;
  p: AccountProvider;
  sub: string;
  email: string | null;
  uses: AccountUse[];
  scopes: string[];
  refresh: string;
  e: number;
}

const stateLabel = (p: AccountProvider) => `caime account state v1 ${p}`;
const claimLabel = (p: AccountProvider) => `caime account claim v1 ${p}`;
export const refreshLabel = (id: string) => `caime account refresh v1 ${id}`;
const stateKey = (ctx: AppContext) => serverKey(ctx, 'accounts.state');

/** The provider's consent link for the uses asked, with who asked sealed in its state. */
export async function accountConsentUrl(
  ctx: AppContext,
  userId: string,
  p: AccountProvider,
  ask: { uses: AccountUse[]; back: 'web' | 'app' },
): Promise<string> {
  const client = providerClient(ctx.config, p);
  if (!client) throw notFound(tr('That account'));
  const asked: Asked = {
    u: userId,
    uses: ask.uses,
    b: ask.back,
    e: ctx.now().getTime() + CONSENT_MS,
  };
  return consentLink(client, p, {
    redirect: accountRedirectUri(ctx, p),
    scopes: accountScopes(p, ask.uses),
    state: sealState(await stateKey(ctx), asked, stateLabel(p)),
    offline: true,
  });
}

/** Who the account is, by its access: the provider's id for it and its address. */
async function whoIs(
  ctx: AppContext,
  p: AccountProvider,
  access: string,
): Promise<{ sub: string; email: string | null } | null> {
  const url =
    p === 'google'
      ? ctx.config.GOOGLE_USERINFO_URL
      : `${ctx.config.MICROSOFT_GRAPH_API.replace(/\/+$/, '')}/v1.0/me?$select=id,mail,userPrincipalName`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${access}`, accept: 'application/json' },
    signal: AbortSignal.timeout(PROVIDER_MS),
  });
  if (!res.ok) return null;
  const b = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const sub = p === 'google' ? b.sub : b.id;
  const email = p === 'google' ? b.email : (b.mail ?? b.userPrincipalName);
  return typeof sub === 'string' && sub
    ? { sub, email: typeof email === 'string' ? email.toLowerCase() : null }
    : null;
}

/**
 * The provider's return: the code traded and sealed into a claim for the app to redeem, or why
 * there's none. Where it lands is the screen it was asked from (the web's, or the phone app's).
 */
export async function finishAccountConsent(
  ctx: AppContext,
  p: AccountProvider,
  query: { code?: string; state?: string; error?: string },
): Promise<string> {
  const asked = openState<Asked>(await stateKey(ctx), query.state, stateLabel(p), ctx.now());
  const to = (b: 'web' | 'app', q: Record<string, string>) =>
    `${landingFor(ctx.config, b, ACCOUNT_RETURN_PATH)}#${new URLSearchParams({ account: p, ...q })}`;
  if (!asked) return to('web', { error: 'expired' satisfies AccountReturnError });
  const fail = (error: AccountReturnError) => to(asked.b, { error });
  const client = providerClient(ctx.config, p);
  if (!client || query.error || !query.code) return fail(refusedAs(query.error));
  const tokens = await tradeCode(ctx, p, client, {
    code: query.code,
    redirect: accountRedirectUri(ctx, p),
    scopes: accountScopes(p, asked.uses),
    what: 'accounts',
  });
  if (!tokens) return fail('failed');
  // A connection renews itself, so one without a refresh token isn't one.
  if (!tokens.refresh) {
    ctx.log.warn({ provider: p }, 'accounts: no refresh token came');
    return fail('failed');
  }
  // Google lets each permission be unticked; Microsoft's consent is all or nothing, and its
  // answer names the permissions without their resource, so it's read as asked.
  const uses = p === 'google' ? usesGranted(p, asked.uses, tokens.scopes) : asked.uses;
  if (uses.length === 0) return fail('denied');
  try {
    const who = await whoIs(ctx, p, tokens.access);
    if (!who) return fail('failed');
    const claim: Claim = {
      u: asked.u,
      p,
      sub: who.sub,
      email: who.email,
      uses,
      scopes: tokens.scopes,
      refresh: tokens.refresh,
      e: ctx.now().getTime() + CONSENT_MS,
    };
    return to(asked.b, { claim: sealState(await stateKey(ctx), claim, claimLabel(p)) });
  } catch (err) {
    ctx.log.warn(
      { provider: p, err: (err as Error).name },
      'accounts: the provider did not answer',
    );
    return fail('failed');
  }
}

const RUNNING_USES: readonly AccountRunningUse[] = ['calendar', 'plans'];

/** How each use that runs on its own last went, for the uses the connection has. */
function healthOf(r: Row): AccountUseHealthView[] {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return RUNNING_USES.filter((u) => r.uses.includes(u)).map((use) =>
    use === 'calendar'
      ? {
          use,
          workedAt: iso(r.synced_at),
          failure: r.read_failure,
          failedAt: iso(r.read_failed_at),
        }
      : {
          use,
          workedAt: iso(r.pushed_at),
          failure: r.push_failure,
          failedAt: iso(r.push_failed_at),
        },
  );
}

export function accountView(r: Row): ConnectedAccountView {
  const health = healthOf(r);
  return {
    id: r.id,
    provider: r.provider,
    email: r.email,
    uses: r.uses as AccountUse[],
    // Its own standing, else failing while any use's last try failed (or the release before
    // said so, until a read or a push works).
    state:
      r.state === 'reconnect'
        ? 'reconnect'
        : r.state === 'failing' || health.some((h) => h.failure)
          ? 'failing'
          : 'connected',
    createdAt: r.created_at.toISOString(),
    syncedAt: r.synced_at?.toISOString() ?? null,
    mainCalendarOnly: r.uses.includes('calendar') && !readsEveryCalendar(r.provider, r.scopes),
    health,
  };
}

/**
 * Redeems a claim for the person signed in: only the one who asked, within ten minutes. The
 * same account connected again (by the provider's id for it) replaces its connection.
 */
export async function redeemAccountClaim(
  ctx: AppContext,
  userId: string,
  p: AccountProvider,
  raw: string,
): Promise<ConnectedAccountView> {
  const claim = openState<Claim>(await stateKey(ctx), raw, claimLabel(p), ctx.now());
  if (!claim || claim.p !== p)
    throw badRequest(tr('That connection took too long. Connect again.'));
  if (claim.u !== userId)
    throw new AppError(403, 'forbidden', tr('That connection was started by someone else.'));
  const existing = await ctx.db
    .selectFrom('connected_accounts')
    .select('id')
    .where('user_id', '=', userId)
    .where('provider', '=', p)
    .where('subject', '=', claim.sub)
    .executeTakeFirst();
  const id = existing?.id ?? uuidv7();
  const { sealed, kid } = await sealSecret(ctx, Buffer.from(claim.refresh), refreshLabel(id));
  const row = await ctx.db
    .insertInto('connected_accounts')
    .values({
      id,
      user_id: userId,
      provider: p,
      subject: claim.sub,
      email: claim.email,
      uses: claim.uses,
      scopes: claim.scopes,
      refresh_sealed: sealed,
      refresh_kid: kid,
      state: 'connected',
    })
    .onConflict((oc) =>
      oc.columns(['user_id', 'provider', 'subject']).doUpdateSet({
        email: claim.email,
        uses: claim.uses,
        scopes: claim.scopes,
        refresh_sealed: sealed,
        refresh_kid: kid,
        state: 'connected',
      }),
    )
    .returning(ACCOUNT_ROW)
    .executeTakeFirstOrThrow();
  accessCache.delete(id);
  await accountsChanged(ctx, userId);
  return accountView(row);
}

export async function accountsOf(ctx: AppContext, userId: string): Promise<ConnectedAccountView[]> {
  const rows = await ctx.db
    .selectFrom('connected_accounts')
    .select(ACCOUNT_ROW)
    .where('user_id', '=', userId)
    .orderBy('created_at')
    .execute();
  return rows.map(accountView);
}

export async function accountOf(ctx: AppContext, userId: string, id: string): Promise<Row> {
  const row = await ctx.db
    .selectFrom('connected_accounts')
    .select(ACCOUNT_ROW)
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!row) throw notFound(tr('That account'));
  return row;
}

/**
 * A connection's refresh token opened, or null when no key here opens it. One sealed with a key
 * that no longer seals is sealed again with the one that does as it's used (M16 B5).
 */
export async function openRefresh(
  ctx: AppContext,
  account: Pick<Row, 'id' | 'refresh_sealed' | 'refresh_kid'>,
): Promise<Buffer | null> {
  const opened = await openSecret(
    ctx,
    { sealed: account.refresh_sealed, kid: account.refresh_kid },
    refreshLabel(account.id),
  );
  if (!opened) return null;
  if (opened.stale) await resealRefresh(ctx, account.id, account.refresh_sealed, opened.plain);
  return opened.plain;
}

/** Sealed again with the key that seals now, unless it changed meanwhile (a renewal kept one). */
export async function resealRefresh(
  ctx: AppContext,
  id: string,
  was: Buffer,
  plain: Buffer,
): Promise<void> {
  const next = await sealSecret(ctx, plain, refreshLabel(id));
  await ctx.db
    .updateTable('connected_accounts')
    .set({ refresh_sealed: next.sealed, refresh_kid: next.kid })
    .where('id', '=', id)
    .where('refresh_sealed', '=', was)
    .execute();
}

/** Accesses renewed from a refresh token, in memory only, a minute short of their hour. */
const accessCache = new TtlCache<string, string>(10_000, 50 * 60_000);

/**
 * An access for a connection, or why there's none (M16 G2): its grant is gone (the person
 * revoked it at the provider, or no key here opens its refresh token), so it asks to be connected
 * again and nothing more is asked of the provider for it; or the provider didn't give one this
 * time (no answer, or Caime's own client refused, which the provider's probe says), which the use
 * that asked keeps as its own failure, never the connection's.
 */
export type Access = { access: string } | { none: 'reconnect' | 'unanswered' };

export async function accessFor(ctx: AppContext, account: Row): Promise<Access> {
  const cached = accessCache.get(account.id, ctx.now().getTime());
  if (cached) return { access: cached };
  const client = providerClient(ctx.config, account.provider);
  if (!client) return { none: 'unanswered' };
  const refresh = await openRefresh(ctx, account);
  if (!refresh) {
    await markReconnect(ctx, account.id);
    return { none: 'reconnect' };
  }
  let body: Record<string, unknown>;
  try {
    ({ body } = await postForm(client.token, {
      client_id: client.id,
      client_secret: client.secret,
      refresh_token: refresh.toString(),
      grant_type: 'refresh_token',
    }));
  } catch (err) {
    ctx.log.warn({ provider: account.provider, err: (err as Error).name }, 'accounts: no access');
    return { none: 'unanswered' };
  }
  const access = typeof body.access_token === 'string' ? body.access_token : null;
  if (!access) {
    // `invalid_grant`: revoked or expired at the provider. Anything else (`invalid_client` is
    // Caime's own) isn't the person's to fix.
    if (body.error === 'invalid_grant') {
      await markReconnect(ctx, account.id);
      return { none: 'reconnect' };
    }
    ctx.log.warn(
      { provider: account.provider, error: String(body.error ?? '').slice(0, 40) },
      'accounts: the provider gave no access',
    );
    return { none: 'unanswered' };
  }
  // Microsoft hands a new refresh token with each access: the new one is kept.
  if (typeof body.refresh_token === 'string' && body.refresh_token !== refresh.toString()) {
    const next = await sealSecret(ctx, Buffer.from(body.refresh_token), refreshLabel(account.id));
    await ctx.db
      .updateTable('connected_accounts')
      .set({ refresh_sealed: next.sealed, refresh_kid: next.kid })
      .where('id', '=', account.id)
      .execute();
  }
  const seconds = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  accessCache.set(account.id, access, ctx.now().getTime(), Math.max(60, seconds - 60) * 1000);
  return { access };
}

/**
 * The connection's grant is gone: it asks to be connected again, what it said holds nobody's
 * time any longer, and its person is told once, as it stops (M16 G2), never again until it's
 * connected again and stops again.
 */
export async function markReconnect(ctx: AppContext, id: string): Promise<void> {
  const changed = await ctx.db
    .updateTable('connected_accounts')
    .set({ state: 'reconnect' })
    .where('id', '=', id)
    .where('state', '<>', 'reconnect')
    .returning(['user_id', 'provider'])
    .executeTakeFirst();
  accessCache.delete(id);
  await ctx.db.deleteFrom('external_busy').where('account_id', '=', id).execute();
  if (!changed) return;
  await accountsChanged(ctx, changed.user_id);
  const name = ACCOUNT_PROVIDER_NAMES[changed.provider];
  await notify(ctx, {
    userId: changed.user_id,
    kind: 'account',
    level: 'attention',
    title: () => tr('{name} needs connecting again', { name }),
    body: () => tr('Caime can’t use it for you until you connect it again in Settings · Apps.'),
    data: { account: id },
    groupKey: `account:${id}`,
  });
}

/**
 * What a use's try changes on its connection (M16 G2): working, when and nothing failing since
 * (and a 'failing' the release before wrote let go); failed, why and when, and until when the
 * provider asked Caime to wait. The other use's health is never touched.
 */
export function useOutcome(
  use: AccountRunningUse,
  outcome: { worked: Date } | { failed: AccountFailure; at: Date; restUntil: Date | null },
): Updateable<ConnectedAccountsTable> {
  if ('worked' in outcome)
    return use === 'calendar'
      ? { synced_at: outcome.worked, read_failure: null, read_failed_at: null }
      : { pushed_at: outcome.worked, push_failure: null, push_failed_at: null };
  return {
    ...(use === 'calendar'
      ? { read_failure: outcome.failed, read_failed_at: outcome.at }
      : { push_failure: outcome.failed, push_failed_at: outcome.at }),
    ...(outcome.restUntil ? { rest_until: outcome.restUntil } : {}),
  };
}

/**
 * Keeps a use's outcome, and tells the person's devices when what their list shows changed: a
 * first read, a failure come or gone, or a 'failing' from the release before let go.
 */
export async function noteUse(
  ctx: AppContext,
  account: Row,
  use: AccountRunningUse,
  outcome: { worked: Date } | { failed: AccountFailure; restUntil?: Date | null },
): Promise<void> {
  const set =
    'worked' in outcome
      ? useOutcome(use, outcome)
      : useOutcome(use, {
          failed: outcome.failed,
          at: ctx.now(),
          restUntil: outcome.restUntil ?? null,
        });
  await ctx.db
    .updateTable('connected_accounts')
    .set({
      ...set,
      ...('worked' in outcome && account.state === 'failing' ? { state: 'connected' } : {}),
    })
    .where('id', '=', account.id)
    .where('state', '<>', 'reconnect')
    .execute();
  if (shownChanged(account, use, 'worked' in outcome ? null : outcome.failed))
    await accountsChanged(ctx, account.user_id);
}

/** Whether a use's outcome changes what the person's list shows of the connection. */
export function shownChanged(account: Row, use: AccountRunningUse, failure: AccountFailure | null) {
  const was = use === 'calendar' ? account.read_failure : account.push_failure;
  const first = use === 'calendar' ? !account.synced_at : !account.pushed_at;
  return was !== failure || account.state === 'failing' || (failure === null && first);
}

/**
 * Until when a provider that answered 429 asked Caime to wait: its Retry-After, in seconds or as
 * a date, held between a minute and six hours; five minutes when it says nothing.
 */
export function restUntilOf(retryAfter: string | null | undefined, now: Date): Date {
  let ms = 5 * 60_000;
  const said = retryAfter?.trim() ?? '';
  if (/^\d+$/.test(said)) ms = Number(said) * 1000;
  else if (said && !Number.isNaN(Date.parse(said))) ms = Date.parse(said) - now.getTime();
  return new Date(now.getTime() + Math.min(6 * 3_600_000, Math.max(60_000, ms)));
}

/**
 * Whether a provider's refusal asks Caime to wait: a 429, or Google's 403 for a rate or a quota.
 */
export function askedToWait(status: number, body: unknown): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  const errors =
    (body as { error?: { errors?: Array<{ reason?: unknown }> } } | null)?.error?.errors ?? [];
  return errors.some(
    (e) => typeof e.reason === 'string' && /RateLimitExceeded|quotaExceeded/i.test(e.reason),
  );
}

/**
 * How many connections each use has, by how it last went (working, failing, reconnect), in one
 * query, kept for /metrics on every instance (M16 G2: `caime_connected_accounts`).
 */
export async function countAccountHealth(ctx: AppContext): Promise<void> {
  const { rows } = await sql<{ use: string; health: string; n: string }>`
    select u.use,
      case
        when a.state = 'reconnect' then 'reconnect'
        when (u.use = 'calendar' and a.read_failure is not null)
          or (u.use = 'plans' and a.push_failure is not null) then 'failing'
        else 'working'
      end as health,
      count(*) as n
    from connected_accounts a
    cross join unnest(array['calendar', 'plans']) as u(use)
    where u.use = any(a.uses)
    group by 1, 2`.execute(ctx.db);
  const counts = rows.map((r) => ({ use: r.use, health: r.health, n: Number(r.n) }));
  const at = ctx.now().getTime();
  await writeSetting(ctx.db, ACCOUNTS_SETTING, { at, counts }, ctx.now());
  Object.assign(accountsState, { at, counts });
}

/** Their Connected list reads again on every device (M15): connected, ended, or its state moved. */
export async function accountsChanged(ctx: AppContext, userId: string): Promise<void> {
  await ctx.bus.publish([userId], { type: 'apps.changed', data: { appId: null } });
}

/**
 * Disconnects: the events Caime wrote there that are still ahead are taken out (R96), the
 * provider is told where it can be (Google revokes the token; Microsoft has no such call, and
 * the person removes Caime under their account's apps), and the connection and everything read
 * or written with it go.
 */
export async function disconnectAccount(ctx: AppContext, account: Row): Promise<void> {
  // What Caime wrote into its calendar that's still ahead goes first, while it still may (R96).
  await withdrawPlans(ctx, account);
  const refresh = (
    await openSecret(
      ctx,
      { sealed: account.refresh_sealed, kid: account.refresh_kid },
      refreshLabel(account.id),
    )
  )?.plain;
  if (account.provider === 'google' && refresh)
    await postForm(ctx.config.GOOGLE_REVOKE_URL, { token: refresh.toString() }).catch((err) =>
      ctx.log.warn({ err: (err as Error).name }, 'accounts: Google did not take the revocation'),
    );
  await ctx.db.deleteFrom('connected_accounts').where('id', '=', account.id).execute();
  accessCache.delete(account.id);
  await accountsChanged(ctx, account.user_id);
}

/** Every connection of a person ends (their access ended, or their account goes). */
export async function disconnectAllAccounts(ctx: AppContext, userId: string): Promise<void> {
  const rows = await ctx.db
    .selectFrom('connected_accounts')
    .select(ACCOUNT_ROW)
    .where('user_id', '=', userId)
    .execute();
  for (const r of rows) await disconnectAccount(ctx, r);
}

interface PickerTicket {
  u: string;
  a: string;
  b: 'web' | 'app';
  /** Its nonce, spent as it's opened (M16 G1). */
  n: string;
  e: number;
}
const PICKER_MS = 5 * 60_000;
const pickerLabel = 'caime account picker v1';

/**
 * Google's picker opens on a page of its own (R90): this ticket names who asked, for which
 * account and where it returns, so the page needs no session (a phone's sign-in sheet has none),
 * good for five minutes and opened once (M16 G1: a second opening finds its nonce spent).
 */
export async function pickerTicket(
  ctx: AppContext,
  userId: string,
  accountId: string,
  back: 'web' | 'app',
): Promise<string> {
  const ticket: PickerTicket = {
    u: userId,
    a: accountId,
    b: back,
    n: uuidv4(),
    e: ctx.now().getTime() + PICKER_MS,
  };
  return sealState(await stateKey(ctx), ticket, pickerLabel);
}

export async function openPickerTicket(
  ctx: AppContext,
  raw: string | undefined,
): Promise<{ userId: string; accountId: string; back: 'web' | 'app' } | null> {
  const t = openState<PickerTicket>(await stateKey(ctx), raw, pickerLabel, ctx.now());
  if (!t || typeof t.n !== 'string' || !UUID.test(t.n)) return null;
  if (!(await spendTicket(ctx, t.n, new Date(t.e)))) return null;
  return { userId: t.u, accountId: t.a, back: t.b === 'app' ? 'app' : 'web' };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * An access narrowed to one scope (M16 G1: Google's picker page hands its access to the browser,
 * so it asks for the picked files alone, never the calendar or the profile the connection also
 * reaches), kept nowhere; null when the provider answers with more than asked or not at all, and
 * the caller decides what to do without it. A refresh token the provider no longer takes asks
 * for the connection to be made again, as `accessFor` does.
 */
export async function narrowedAccess(
  ctx: AppContext,
  account: Row,
  scope: string,
): Promise<string | null> {
  const client = providerClient(ctx.config, account.provider);
  const refresh = await openRefresh(ctx, account);
  if (!client || !refresh) return null;
  let body: Record<string, unknown>;
  try {
    ({ body } = await postForm(client.token, {
      client_id: client.id,
      client_secret: client.secret,
      refresh_token: refresh.toString(),
      grant_type: 'refresh_token',
      scope,
    }));
  } catch {
    return null;
  }
  if (body.error === 'invalid_grant') {
    await markReconnect(ctx, account.id);
    return null;
  }
  const granted = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [];
  const narrowed = granted.length > 0 && granted.every((s) => s === scope);
  return narrowed && typeof body.access_token === 'string' ? body.access_token : null;
}
