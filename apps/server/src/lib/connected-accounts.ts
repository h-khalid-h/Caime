/**
 * A person's Google or Microsoft account, connected for the uses they turn on (R90). The
 * provider's clients are the ones R89 reads contacts with (`contactClient`), so the owner
 * registers one client per provider. Unlike R89's one hour, a connection renews itself: its
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

import { uuidv7 } from '@caime/core';
import {
  ACCOUNT_RETURN_PATH,
  type AccountProvider,
  type AccountReturnError,
  type AccountUse,
  accountScopes,
  usesGranted,
} from '@caime/core/accounts';
import { APP_SCHEME, type ConnectedAccountView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import type { ConnectedAccountsTable } from '../db/schema';
import { contactClient } from './contact-accounts';
import { AppError, badRequest, notFound } from './errors';
import { serverKey } from './server-keys';
import { TtlCache } from './ttl-cache';
import { seal, unseal } from './vault';

/** How long a consent may take, and its claim be redeemed in. */
const CLAIM_MS = 10 * 60_000;
/** One deadline for any exchange with a provider. */
const PROVIDER_MS = 10_000;

type Row = Pick<
  ConnectedAccountsTable,
  'id' | 'user_id' | 'provider' | 'email' | 'uses' | 'state' | 'refresh_sealed'
> & { created_at: Date; synced_at: Date | null };

export function accountsOffered(ctx: Pick<AppContext, 'config'>): AccountProvider[] {
  return (['google', 'microsoft'] as const).filter((p) => contactClient(ctx.config, p));
}

/** Where the provider returns: the address each client is registered with, beside R89's. */
export function accountRedirectUri(ctx: Pick<AppContext, 'config'>, p: AccountProvider): string {
  return `${ctx.config.PUBLIC_URL.replace(/\/+$/, '')}/v1/accounts/${p}/back`;
}

function landing(ctx: AppContext, back: 'web' | 'app'): string {
  return back === 'app'
    ? `${APP_SCHEME}://${ACCOUNT_RETURN_PATH}`
    : `${ctx.config.PUBLIC_URL.replace(/\/+$/, '')}/${ACCOUNT_RETURN_PATH}`;
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
const refreshLabel = (id: string) => `caime account refresh v1 ${id}`;
const stateKey = (ctx: AppContext) => serverKey(ctx, 'accounts.state');
const vaultKey = (ctx: AppContext) => serverKey(ctx, 'accounts.vault');

function sealJson(key: Buffer, value: unknown, label: string): string {
  return seal(key, Buffer.from(JSON.stringify(value)), label).toString('base64url');
}

function openJson<T>(key: Buffer, raw: string | undefined, label: string): T | null {
  if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const plain = unseal(key, Buffer.from(raw, 'base64url'), label);
  if (!plain) return null;
  try {
    return JSON.parse(plain.toString()) as T;
  } catch {
    return null;
  }
}

/** The provider's consent link for the uses asked, with who asked sealed in its state. */
export async function accountConsentUrl(
  ctx: AppContext,
  userId: string,
  p: AccountProvider,
  ask: { uses: AccountUse[]; back: 'web' | 'app' },
): Promise<string> {
  const client = contactClient(ctx.config, p);
  if (!client) throw notFound(tr('That account'));
  const asked: Asked = {
    u: userId,
    uses: ask.uses,
    b: ask.back,
    e: ctx.now().getTime() + CLAIM_MS,
  };
  const q = new URLSearchParams({
    client_id: client.id,
    redirect_uri: accountRedirectUri(ctx, p),
    response_type: 'code',
    scope: accountScopes(p, ask.uses).join(' '),
    state: sealJson(await stateKey(ctx), asked, stateLabel(p)),
  });
  if (p === 'google') {
    // A refresh token only comes with `offline` and a consent shown again.
    q.set('access_type', 'offline');
    q.set('prompt', 'consent select_account');
    q.set('include_granted_scopes', 'true');
  } else {
    q.set('response_mode', 'query');
    q.set('prompt', 'select_account');
  }
  return `${client.authorize}?${q}`;
}

async function postForm(
  url: string,
  form: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(PROVIDER_MS),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  };
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
  const asked = openJson<Asked>(await stateKey(ctx), query.state, stateLabel(p));
  const fresh = asked && typeof asked.e === 'number' && asked.e > ctx.now().getTime();
  const to = (b: 'web' | 'app', q: Record<string, string>) =>
    `${landing(ctx, b)}#${new URLSearchParams({ account: p, ...q })}`;
  if (!asked || !fresh) return to('web', { error: 'expired' satisfies AccountReturnError });
  const fail = (error: AccountReturnError) => to(asked.b, { error });
  const client = contactClient(ctx.config, p);
  if (!client || query.error || !query.code)
    return fail(query.error === 'access_denied' ? 'denied' : 'failed');
  try {
    const form: Record<string, string> = {
      client_id: client.id,
      client_secret: client.secret,
      code: query.code,
      redirect_uri: accountRedirectUri(ctx, p),
      grant_type: 'authorization_code',
    };
    if (p === 'microsoft') form.scope = accountScopes(p, asked.uses).join(' ');
    const { status, body } = await postForm(client.token, form);
    const access = typeof body.access_token === 'string' ? body.access_token : null;
    const refresh = typeof body.refresh_token === 'string' ? body.refresh_token : null;
    if (status !== 200 || !access || !refresh) {
      ctx.log.warn({ provider: p, status, refresh: Boolean(refresh) }, 'accounts: no connection');
      return fail('failed');
    }
    const scopes = typeof body.scope === 'string' ? body.scope.split(' ').filter(Boolean) : [];
    // Google lets each permission be unticked; Microsoft's consent is all or nothing, and its
    // answer names the permissions without their resource, so it's read as asked.
    const uses = p === 'google' ? usesGranted(p, asked.uses, scopes) : asked.uses;
    if (uses.length === 0) return fail('denied');
    const who = await whoIs(ctx, p, access);
    if (!who) return fail('failed');
    const claim: Claim = {
      u: asked.u,
      p,
      sub: who.sub,
      email: who.email,
      uses,
      scopes,
      refresh,
      e: ctx.now().getTime() + CLAIM_MS,
    };
    return to(asked.b, { claim: sealJson(await stateKey(ctx), claim, claimLabel(p)) });
  } catch (err) {
    ctx.log.warn(
      { provider: p, err: (err as Error).name },
      'accounts: the provider did not answer',
    );
    return fail('failed');
  }
}

export function accountView(r: Row): ConnectedAccountView {
  return {
    id: r.id,
    provider: r.provider,
    email: r.email,
    uses: r.uses as AccountUse[],
    state: r.state,
    createdAt: r.created_at.toISOString(),
    syncedAt: r.synced_at?.toISOString() ?? null,
  };
}

const ROW = [
  'id',
  'user_id',
  'provider',
  'email',
  'uses',
  'state',
  'refresh_sealed',
  'created_at',
  'synced_at',
] as const;

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
  const claim = openJson<Claim>(await stateKey(ctx), raw, claimLabel(p));
  if (!claim || claim.p !== p || claim.e <= ctx.now().getTime())
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
  const sealed = seal(await vaultKey(ctx), Buffer.from(claim.refresh), refreshLabel(id));
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
      state: 'connected',
    })
    .onConflict((oc) =>
      oc.columns(['user_id', 'provider', 'subject']).doUpdateSet({
        email: claim.email,
        uses: claim.uses,
        scopes: claim.scopes,
        refresh_sealed: sealed,
        state: 'connected',
      }),
    )
    .returning(ROW)
    .executeTakeFirstOrThrow();
  accessCache.delete(id);
  await accountsChanged(ctx, userId);
  return accountView(row);
}

export async function accountsOf(ctx: AppContext, userId: string): Promise<ConnectedAccountView[]> {
  const rows = await ctx.db
    .selectFrom('connected_accounts')
    .select(ROW)
    .where('user_id', '=', userId)
    .orderBy('created_at')
    .execute();
  return rows.map(accountView);
}

export async function accountOf(ctx: AppContext, userId: string, id: string): Promise<Row> {
  const row = await ctx.db
    .selectFrom('connected_accounts')
    .select(ROW)
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!row) throw notFound(tr('That account'));
  return row;
}

/** Accesses renewed from a refresh token, in memory only, a minute short of their hour. */
const accessCache = new TtlCache<string, string>(10_000, 50 * 60_000);

/**
 * An access for a connection, renewed when needed; null when the provider refuses (the person
 * revoked it there, or its password changed): the connection then asks to be connected again,
 * and nothing more is asked of the provider for it.
 */
export async function accessFor(ctx: AppContext, account: Row): Promise<string | null> {
  const cached = accessCache.get(account.id, ctx.now().getTime());
  if (cached) return cached;
  const client = contactClient(ctx.config, account.provider);
  const refresh = unseal(await vaultKey(ctx), account.refresh_sealed, refreshLabel(account.id));
  if (!client || !refresh) {
    await markAccount(ctx, account.id, 'reconnect');
    return null;
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
    await markAccount(ctx, account.id, 'failing');
    return null;
  }
  const access = typeof body.access_token === 'string' ? body.access_token : null;
  if (!access) {
    // `invalid_grant`: revoked or expired at the provider; anything else may pass.
    await markAccount(ctx, account.id, body.error === 'invalid_grant' ? 'reconnect' : 'failing');
    return null;
  }
  // Microsoft hands a new refresh token with each access: the new one is kept.
  if (typeof body.refresh_token === 'string' && body.refresh_token !== refresh.toString())
    await ctx.db
      .updateTable('connected_accounts')
      .set({
        refresh_sealed: seal(
          await vaultKey(ctx),
          Buffer.from(body.refresh_token),
          refreshLabel(account.id),
        ),
      })
      .where('id', '=', account.id)
      .execute();
  const seconds = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  accessCache.set(account.id, access, ctx.now().getTime(), Math.max(60, seconds - 60) * 1000);
  return access;
}

export async function markAccount(
  ctx: AppContext,
  id: string,
  state: ConnectedAccountsTable['state'],
): Promise<void> {
  const changed = await ctx.db
    .updateTable('connected_accounts')
    .set({ state })
    .where('id', '=', id)
    .where('state', '<>', state)
    .returning('user_id')
    .executeTakeFirst();
  if (state !== 'connected') accessCache.delete(id);
  // What it said can't be read again: nothing it said holds anyone's time any longer.
  if (state === 'reconnect')
    await ctx.db.deleteFrom('external_busy').where('account_id', '=', id).execute();
  if (changed) await accountsChanged(ctx, changed.user_id);
}

/** Their Connected list reads again on every device (M15): connected, ended, or its state moved. */
export async function accountsChanged(ctx: AppContext, userId: string): Promise<void> {
  await ctx.bus.publish([userId], { type: 'apps.changed', data: { appId: null } });
}

/**
 * Disconnects: the provider is told where it can be (Google revokes the token; Microsoft has no
 * such call, and the person removes Caime under their account's apps), and the connection and
 * everything read with it go.
 */
export async function disconnectAccount(ctx: AppContext, account: Row): Promise<void> {
  const refresh = unseal(await vaultKey(ctx), account.refresh_sealed, refreshLabel(account.id));
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
    .select(ROW)
    .where('user_id', '=', userId)
    .execute();
  for (const r of rows) await disconnectAccount(ctx, r);
}

interface PickerTicket {
  u: string;
  a: string;
  b: 'web' | 'app';
  e: number;
}
const PICKER_MS = 5 * 60_000;
const pickerLabel = 'caime account picker v1';

/**
 * Google's picker opens on a page of its own (R90): this one-time ticket names who asked, for
 * which account and where it returns, so the page needs no session (a phone's sign-in sheet has
 * none), good for five minutes.
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
    e: ctx.now().getTime() + PICKER_MS,
  };
  return sealJson(await stateKey(ctx), ticket, pickerLabel);
}

export async function openPickerTicket(
  ctx: AppContext,
  raw: string | undefined,
): Promise<{ userId: string; accountId: string; back: 'web' | 'app' } | null> {
  const t = openJson<PickerTicket>(await stateKey(ctx), raw, pickerLabel);
  if (!t || typeof t.e !== 'number' || t.e <= ctx.now().getTime()) return null;
  return { userId: t.u, accountId: t.a, back: t.b === 'app' ? 'app' : 'web' };
}
