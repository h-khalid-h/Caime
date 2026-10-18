/**
 * Contacts from someone's Google or Microsoft account (R89), read once, when they ask, on their
 * own device. The server holds the providers' clients (a client secret can't live in an app), so
 * it writes the consent link and trades the one-time code for an access that lasts the hour and
 * renews nothing, through the consent pipeline connections use too (`lib/provider-consent.ts`).
 * That access is sealed to the key the device sent when it asked (core `contact-seal.ts`) and
 * handed back in the fragment of the address the device returns to, which no server reads; the
 * device reads the contacts from the provider itself. Nothing is kept: the state that rides the
 * consent is sealed with the server's own key and carries the device's key, where it returns and
 * a deadline, and the access is never stored, logged or used here.
 */
import {
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
import {
  CONSENT_MS,
  consentLink,
  landingFor,
  openState,
  providerClient,
  providersOn,
  refusedAs,
  sealState,
  tradeCode,
} from './provider-consent';
import { serverKey } from './server-keys';
import { seal } from './vault';

/** The accounts offered here, each with the API its contacts are read on. */
export function contactAccountsOn(config: Config): ContactAccountView[] {
  return providersOn(config).map((id) => ({
    id,
    api: (providerClient(config, id)?.api ?? '').replace(/\/+$/, ''),
  }));
}

/** The origins the web app reads contacts from, for its Content-Security-Policy. */
export function contactApiOrigins(config: Config): string[] {
  return contactAccountsOn(config).map((a) => new URL(a.api).origin);
}

/** Where the provider returns: the address each client is registered with. */
export function contactRedirectUri(config: Config, account: ContactAccount): string {
  return `${config.PUBLIC_URL}/v1/contacts/accounts/${account}/back`;
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
  const client = providerClient(ctx.config, account);
  if (!client) return null;
  const state: ConsentState = { k: ask.key, b: ask.back, e: ctx.now().getTime() + CONSENT_MS };
  return consentLink(client, account, {
    redirect: contactRedirectUri(ctx.config, account),
    scopes: CONTACT_ACCOUNT_SCOPES[account],
    state: sealState(await stateKey(ctx), state, stateLabel(account)),
    offline: false,
  });
}

async function readState(
  ctx: AppContext,
  account: ContactAccount,
  raw: string | undefined,
): Promise<ConsentState | null> {
  const s = openState<ConsentState>(await stateKey(ctx), raw, stateLabel(account), ctx.now());
  const key = typeof s?.k === 'string' && Buffer.from(s.k, 'base64url').length === 32;
  return s && key && (s.b === 'web' || s.b === 'app') ? s : null;
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
  const to = (b: 'web' | 'app', fragment: string) =>
    `${landingFor(ctx.config, b, CONTACT_RETURN_PATH)}#${fragment}`;
  const state = await readState(ctx, account, query.state);
  if (!state) return to('web', contactReturnFragment({ account, error: 'expired' }));
  const fail = (error: ContactAccountError) =>
    to(state.b, contactReturnFragment({ account, error }));
  const client = providerClient(ctx.config, account);
  if (!client || query.error || !query.code) return fail(refusedAs(query.error));
  const scopes = CONTACT_ACCOUNT_SCOPES[account];
  const tokens = await tradeCode(ctx, account, client, {
    code: query.code,
    redirect: contactRedirectUri(ctx.config, account),
    scopes,
    what: 'contacts',
  });
  if (!tokens) return fail('failed');
  // Google lets each permission be unticked (Microsoft's consent is all or nothing): with none
  // of them given there's nothing to read.
  if (
    account === 'google' &&
    tokens.scopes.length &&
    !scopes.some((s) => tokens.scopes.includes(s))
  )
    return fail('denied');
  const sealed = seal(
    Buffer.from(state.k, 'base64url'),
    Buffer.from(tokens.access),
    contactSealLabel(account),
  );
  return to(state.b, contactReturnFragment({ account, sealed: sealed.toString('base64url') }));
}
