/**
 * Consent at someone's Google or Microsoft account (M16 D4: one pipeline for R89's contacts and
 * R90's connections): the providers' clients (one per provider, registered with both return
 * addresses), the consent link, a state sealed with a server key that rides the consent, and the
 * one-time code traded for tokens. Each use keeps its own return address (`/v1/contacts/…/back`,
 * `/v1/accounts/…/back`), its own key and label for what it seals, and what it does with what
 * came back: contacts hand an hour's access to the device, sealed for it; a connection keeps a
 * refresh token for the person who asked.
 */
import { APP_SCHEME } from '@caime/core/api';
import type { Config } from '../config';
import type { AppContext } from '../context';
import { seal, unseal } from './vault';

export type Provider = 'google' | 'microsoft';
const PROVIDERS: readonly Provider[] = ['google', 'microsoft'];

/** How long a consent may take, from the asking to the return, and a claim be redeemed in. */
export const CONSENT_MS = 10 * 60_000;
/** One deadline for any exchange with a provider. */
export const PROVIDER_MS = 10_000;

export interface ProviderClient {
  id: string;
  secret: string;
  authorize: string;
  token: string;
  /** Where its data is read: Google's People API, Microsoft's Graph. */
  api: string;
}

/** The provider's client, or null when this Caime has none. */
export function providerClient(config: Config, p: Provider): ProviderClient | null {
  if (p === 'google') {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) return null;
    return {
      id: config.GOOGLE_CLIENT_ID,
      secret: config.GOOGLE_CLIENT_SECRET,
      authorize: config.GOOGLE_AUTH_URL,
      token: config.GOOGLE_TOKEN_URL,
      api: config.GOOGLE_PEOPLE_API,
    };
  }
  if (!config.MICROSOFT_CLIENT_ID || !config.MICROSOFT_CLIENT_SECRET) return null;
  const base = `${config.MICROSOFT_LOGIN_BASE.replace(/\/+$/, '')}/${config.MICROSOFT_TENANT}/oauth2/v2.0`;
  return {
    id: config.MICROSOFT_CLIENT_ID,
    secret: config.MICROSOFT_CLIENT_SECRET,
    authorize: `${base}/authorize`,
    token: `${base}/token`,
    api: config.MICROSOFT_GRAPH_API,
  };
}

/** The providers this Caime has a client for. */
export function providersOn(config: Config): Provider[] {
  return PROVIDERS.filter((p) => providerClient(config, p));
}

/** A consent's state, or a claim: JSON sealed under a server key and a label of its own. */
export function sealState<T extends { e: number }>(key: Buffer, value: T, label: string): string {
  return seal(key, Buffer.from(JSON.stringify(value)), label).toString('base64url');
}

/**
 * A sealed state read back, or null: not one (made elsewhere, under another label, or touched
 * on the way) or past its deadline (`e`, in milliseconds).
 */
export function openState<T extends { e: number }>(
  key: Buffer,
  raw: string | undefined,
  label: string,
  now: Date,
): T | null {
  if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const plain = unseal(key, Buffer.from(raw, 'base64url'), label);
  if (!plain) return null;
  try {
    const value = JSON.parse(plain.toString()) as T;
    return typeof value?.e === 'number' && value.e > now.getTime() ? value : null;
  } catch {
    return null;
  }
}

/**
 * A sealed ticket spent: true at its first opening, false at every later one (M16 G1). Its nonce
 * is kept until the ticket would have expired anyway (`spent_tickets`, swept daily), so a ticket
 * that must open once carries a nonce and spends it here as it's opened.
 */
export async function spendTicket(
  ctx: Pick<AppContext, 'db'>,
  nonce: string,
  until: Date,
): Promise<boolean> {
  const row = await ctx.db
    .insertInto('spent_tickets')
    .values({ id: nonce, expires_at: until })
    .onConflict((oc) => oc.column('id').doNothing())
    .returning('id')
    .executeTakeFirst();
  return Boolean(row);
}

/**
 * The provider's consent link. Which account is the person's to choose every time (many have
 * more than one); `offline` asks for a refresh token, which Google gives only with its consent
 * shown again, else an access that lasts the hour and renews nothing.
 */
export function consentLink(
  client: ProviderClient,
  p: Provider,
  ask: { redirect: string; scopes: readonly string[]; state: string; offline: boolean },
): string {
  const q = new URLSearchParams({
    client_id: client.id,
    redirect_uri: ask.redirect,
    response_type: 'code',
    scope: ask.scopes.join(' '),
    state: ask.state,
    prompt: p === 'google' && ask.offline ? 'consent select_account' : 'select_account',
  });
  if (p === 'google') {
    q.set('access_type', ask.offline ? 'offline' : 'online');
    if (ask.offline) q.set('include_granted_scopes', 'true');
  } else q.set('response_mode', 'query');
  return `${client.authorize}?${q}`;
}

/** A form posted to a provider, under one deadline. */
export async function postForm(
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

/** What a consent's one-time code was traded for. */
export interface Tokens {
  access: string;
  /** Only where it was asked for (`offline`) and given. */
  refresh: string | null;
  /** The permissions given, as the provider names them (Google's may be fewer than asked). */
  scopes: string[];
}

/**
 * The consent's one-time code traded at the provider, or null when it refused or didn't answer
 * (said in the log as `what`'s, with the status and never a token).
 */
export async function tradeCode(
  ctx: AppContext,
  p: Provider,
  client: ProviderClient,
  ask: { code: string; redirect: string; scopes: readonly string[]; what: string },
): Promise<Tokens | null> {
  const form: Record<string, string> = {
    client_id: client.id,
    client_secret: client.secret,
    code: ask.code,
    redirect_uri: ask.redirect,
    grant_type: 'authorization_code',
  };
  // Microsoft is told the permissions again; Google takes them from the consent.
  if (p === 'microsoft') form.scope = ask.scopes.join(' ');
  try {
    const { status, body } = await postForm(client.token, form);
    const access = typeof body.access_token === 'string' ? body.access_token : '';
    if (status < 200 || status > 299 || !access) {
      ctx.log.warn({ provider: p, status }, `${ask.what}: the code was not traded`);
      return null;
    }
    return {
      access,
      refresh: typeof body.refresh_token === 'string' ? body.refresh_token : null,
      scopes: typeof body.scope === 'string' ? body.scope.split(' ').filter(Boolean) : [],
    };
  } catch (err) {
    ctx.log.warn(
      { provider: p, err: (err as Error).name },
      `${ask.what}: the provider did not answer`,
    );
    return null;
  }
}

/** Why a return carries nothing, from the provider's own word: the person said no, or it failed. */
export function refusedAs(error: string | undefined): 'denied' | 'failed' {
  return error === 'access_denied' ? 'denied' : 'failed';
}

/** Where a consent lands again: the web app's screen at `path`, or the phone app's. */
export function landingFor(config: Config, back: 'web' | 'app', path: string): string {
  return back === 'app' ? `${APP_SCHEME}://${path}` : `${config.PUBLIC_URL}/${path}`;
}
