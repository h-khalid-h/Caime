/**
 * Contacts from someone's Google or Microsoft account (R89), read once, when they ask, on their
 * own device. The server holds the providers' clients (a client secret can't live in an app), so
 * it writes the consent link and exchanges the one-time code for an access that lasts the hour
 * and renews nothing (Google's `access_type=online`, no `offline_access` from Microsoft). That
 * access is sealed to the key the device sent when it asked (core `contact-seal.ts`) and handed
 * back in the fragment of the address the device returns to, which no server reads; the device
 * reads the contacts from the provider itself. Nothing is kept: the state that rides the consent
 * is sealed with the server's own key and carries the device's key, where it returns and a
 * deadline, and the access is never stored, logged or used here.
 */
import {
  APP_SCHEME,
  CONTACT_ACCOUNT_SCOPES,
  CONTACT_RETURN_PATH,
  type ContactAccount,
  type ContactAccountError,
  contactReturnFragment,
  contactSealLabel,
} from '@caime/core';
import type { ContactAccountView } from '@caime/core/api';
import type { Config } from '../config';
import type { AppContext } from '../context';
import { serverKey } from './server-keys';
import { seal, unseal } from './vault';

/** How long a consent may take, from the device's asking to the provider's return. */
const STATE_MS = 10 * 60_000;
/** One deadline for the code's exchange with the provider. */
const EXCHANGE_MS = 10_000;

interface Client {
  id: string;
  secret: string;
  authorize: string;
  token: string;
  /** Where the device reads the contacts. */
  api: string;
}

/** The provider's client for an account, or null when this Caime has none. */
export function contactClient(config: Config, account: ContactAccount): Client | null {
  if (account === 'google') {
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

/** The accounts offered here, each with the API its contacts are read on. */
export function contactAccountsOn(config: Config): ContactAccountView[] {
  return (['google', 'microsoft'] as const).flatMap((id) => {
    const client = contactClient(config, id);
    return client ? [{ id, api: client.api.replace(/\/+$/, '') }] : [];
  });
}

/** The origins the web app reads contacts from, for its Content-Security-Policy. */
export function contactApiOrigins(config: Config): string[] {
  return contactAccountsOn(config).map((a) => new URL(a.api).origin);
}

/** Where the provider returns: the address each client is registered with. */
export function contactRedirectUri(config: Config, account: ContactAccount): string {
  return `${config.PUBLIC_URL.replace(/\/+$/, '')}/v1/contacts/accounts/${account}/back`;
}

/** Where the person lands again: the web app's Connect screen, or the phone app's. */
function returnTo(config: Config, back: 'web' | 'app'): string {
  return back === 'app'
    ? `${APP_SCHEME}://${CONTACT_RETURN_PATH}`
    : `${config.PUBLIC_URL.replace(/\/+$/, '')}/${CONTACT_RETURN_PATH}`;
}

interface ConsentState {
  /** The device's key, base64url. */
  k: string;
  b: 'web' | 'app';
  /** Until when, in milliseconds. */
  e: number;
}

const stateLabel = (account: ContactAccount) => `caime contacts state v1 ${account}`;
const stateKey = (ctx: AppContext) => serverKey(ctx, 'contacts.state');

/** The provider's consent link for one account, carrying the device's key sealed in its state. */
export async function consentUrl(
  ctx: AppContext,
  account: ContactAccount,
  ask: { key: string; back: 'web' | 'app' },
): Promise<string | null> {
  const client = contactClient(ctx.config, account);
  if (!client) return null;
  const state: ConsentState = { k: ask.key, b: ask.back, e: ctx.now().getTime() + STATE_MS };
  const sealed = seal(await stateKey(ctx), Buffer.from(JSON.stringify(state)), stateLabel(account));
  const q = new URLSearchParams({
    client_id: client.id,
    redirect_uri: contactRedirectUri(ctx.config, account),
    response_type: 'code',
    scope: CONTACT_ACCOUNT_SCOPES[account].join(' '),
    state: sealed.toString('base64url'),
    // Which account to read is the person's to choose, every time: many have more than one.
    prompt: 'select_account',
  });
  if (account === 'google') q.set('access_type', 'online');
  else q.set('response_mode', 'query');
  return `${client.authorize}?${q}`;
}

async function readState(
  ctx: AppContext,
  account: ContactAccount,
  raw: string | undefined,
): Promise<ConsentState | null> {
  if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const plain = unseal(await stateKey(ctx), Buffer.from(raw, 'base64url'), stateLabel(account));
  if (!plain) return null;
  try {
    const s = JSON.parse(plain.toString()) as ConsentState;
    const fresh = typeof s.e === 'number' && s.e > ctx.now().getTime();
    const key = typeof s.k === 'string' && Buffer.from(s.k, 'base64url').length === 32;
    return fresh && key && (s.b === 'web' || s.b === 'app') ? s : null;
  } catch {
    return null;
  }
}

/** The one-time code for an access, or why there's none. */
async function exchange(
  ctx: AppContext,
  account: ContactAccount,
  client: Client,
  code: string,
): Promise<{ access: string } | { error: ContactAccountError }> {
  const form = new URLSearchParams({
    client_id: client.id,
    client_secret: client.secret,
    code,
    redirect_uri: contactRedirectUri(ctx.config, account),
    grant_type: 'authorization_code',
  });
  if (account === 'microsoft') form.set('scope', CONTACT_ACCOUNT_SCOPES.microsoft.join(' '));
  try {
    const res = await fetch(client.token, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: form,
      signal: AbortSignal.timeout(EXCHANGE_MS),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: unknown;
      scope?: unknown;
    };
    if (!res.ok || typeof body.access_token !== 'string' || !body.access_token) {
      ctx.log.warn({ account, status: res.status }, 'contacts: the code was not exchanged');
      return { error: 'failed' };
    }
    // Google lets each permission be unticked (Microsoft's consent is all or nothing): with
    // none of them given there's nothing to read.
    if (account === 'google' && typeof body.scope === 'string') {
      const given = new Set(body.scope.split(' '));
      if (!CONTACT_ACCOUNT_SCOPES[account].some((s) => given.has(s))) return { error: 'denied' };
    }
    return { access: body.access_token };
  } catch (err) {
    ctx.log.warn({ account, err: (err as Error).name }, 'contacts: the provider did not answer');
    return { error: 'failed' };
  }
}

/**
 * Where the provider's return goes on to: the Connect screen it was asked from, with the access
 * sealed for that device, or why there's none. A state that can't be read (made elsewhere, or
 * older than ten minutes) goes to the web app's, since where it came from can't be told.
 */
export async function finishConsent(
  ctx: AppContext,
  account: ContactAccount,
  query: { code?: string; state?: string; error?: string },
): Promise<string> {
  const state = await readState(ctx, account, query.state);
  if (!state)
    return `${returnTo(ctx.config, 'web')}#${contactReturnFragment({ account, error: 'expired' })}`;
  const back = returnTo(ctx.config, state.b);
  const client = contactClient(ctx.config, account);
  const answer: { access: string } | { error: ContactAccountError } =
    !client || query.error || !query.code
      ? { error: query.error === 'access_denied' ? 'denied' : 'failed' }
      : await exchange(ctx, account, client, query.code);
  if ('error' in answer)
    return `${back}#${contactReturnFragment({ account, error: answer.error })}`;
  const sealed = seal(
    Buffer.from(state.k, 'base64url'),
    Buffer.from(answer.access),
    contactSealLabel(account),
  );
  return `${back}#${contactReturnFragment({ account, sealed: sealed.toString('base64url') })}`;
}
