/**
 * Who checks an age for Caime (M16 B7, REVIEW 2026-10-17 §3): one interface, a provider behind it
 * chosen by configuration (`AGE_PROVIDER`), a thin call over fetch as the other providers are.
 * The person is sent to the provider's own page with nothing but an opaque reference (the check's
 * id) and the addresses to come back to; the face or the document is taken there, never by
 * Caime, and Caime hears the outcome two ways that agree: the provider's signed notice (the
 * webhook) and, when the person comes back, a lookup by that reference with the secret key.
 *
 * The first provider is Agemin (Bynn Intelligence): its page is `verify.agemin.com/start/<asset>`
 * with `reference_id` and the three return addresses, its lookup is
 * `GET /v1/agemin/check/reference/:referenceId`, and its notice is a JSON body whose signed copy
 * is an RS256 JWT in `X-Bynn-Signature` (its `data` claim is the notice), checked against
 * Agemin's public key (`AGEMIN_WEBHOOK_PUBLIC_KEY`, else read from its API once a day).
 */
import { createPublicKey, type KeyObject, verify } from 'node:crypto';
import type { AgeMethod } from '@caime/core/age-assurance';
import type { Config } from '../config';

export const AGE_PROVIDERS = ['agemin'] as const;
export type AgeProviderId = (typeof AGE_PROVIDERS)[number];

/** How each provider names itself, for the processors list and the data processing agreement. */
export const AGE_PROVIDER_NAMES: Record<AgeProviderId, string> = {
  agemin: 'Bynn Intelligence (Agemin)',
};

/** One deadline for a whole exchange with the provider. */
const TIMEOUT_MS = 15_000;

/** What a provider found, as Caime keeps it: never an image, a template or a face's numbers. */
export interface AgeResult {
  /** 18 or over, under 18, or no answer (a failed or refused attempt changes nothing). */
  outcome: 'adult' | 'minor' | 'failed';
  method: AgeMethod;
  /** The provider's own word for how sure it was ("high"), when it says one. */
  confidence: string | null;
  /** The provider's reason when it gave no answer ("spoof_aegis"), for the operator. */
  error: string | null;
}

export interface AgeNotice {
  /** The check's id Caime sent as the reference. */
  reference: string;
  result: AgeResult;
}

export interface AgeProvider {
  id: AgeProviderId;
  /** The provider's page for one check, coming back to `back` with `end` set. */
  startUrl(
    reference: string,
    back: (end: 'done' | 'error' | 'cancel') => string,
    locale: string,
  ): string;
  /** What the provider holds for a reference (its latest passing attempt), or null: none yet. */
  lookup(reference: string): Promise<AgeResult | null>;
  /** A notice from the provider, its signature checked; null when it isn't one, or not signed. */
  notice(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<AgeNotice | null>;
  /** The cheapest authenticated read (R78: the provider probe). Throws when it fails. */
  ping(): Promise<void>;
}

/** The provider this Caime is configured for, or null: then nobody is asked for a check. */
export function ageProviderFor(config: Config): AgeProvider | null {
  if (config.AGE_PROVIDER !== 'agemin') return null;
  const asset = config.AGEMIN_ASSET_ID;
  const secret = config.AGEMIN_SECRET_KEY;
  if (!asset || !secret) return null;
  return agemin({
    asset,
    secret,
    api: config.AGEMIN_API_URL.replace(/\/$/, ''),
    verify: config.AGEMIN_VERIFY_URL.replace(/\/$/, ''),
    publicKey: config.AGEMIN_WEBHOOK_PUBLIC_KEY ?? null,
  });
}

interface AgeminResult {
  passed?: boolean | null;
  is_adult?: boolean | null;
  verification_status?: string | null;
  confidence?: string | null;
  age_verification_method?: string | null;
  error_code?: string | null;
}

/**
 * Agemin's words for an attempt, as Caime's: passed is 18 or over; under the threshold with no
 * error is under 18; an attempt it refused (a spoof, a face it couldn't read) answers nothing.
 */
export function fromAgemin(
  r: AgeminResult,
  method: string | null | undefined,
  error: string | null,
): AgeResult {
  const doc = (method ?? r.age_verification_method ?? '') === 'id_document';
  const base = {
    method: (doc ? 'document' : 'estimate') as AgeMethod,
    confidence: typeof r.confidence === 'string' ? r.confidence.slice(0, 16) : null,
  };
  if (r.passed === true && r.is_adult !== false) return { ...base, outcome: 'adult', error: null };
  const refused = error ?? r.error_code ?? null;
  if (refused) return { ...base, outcome: 'failed', error: refused.slice(0, 40) };
  if (r.verification_status === 'underage' || r.is_adult === false)
    return { ...base, outcome: 'minor', error: null };
  return { ...base, outcome: 'failed', error: (r.verification_status ?? 'failed').slice(0, 40) };
}

function base64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** An RS256 JWT's claims, its signature checked with `key`; null when it isn't, or has run out. */
export function readRs256(
  token: string,
  key: KeyObject,
  now: number,
): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string };
  try {
    header = JSON.parse(base64url(h).toString('utf8'));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;
  if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, base64url(s))) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(base64url(p).toString('utf8'));
  } catch {
    return null;
  }
  if (typeof claims.exp === 'number' && claims.exp * 1000 < now) return null;
  return claims;
}

/** A PEM as configured: with real line breaks, or with `\n` where they were. */
export function pemKey(text: string): KeyObject {
  return createPublicKey(text.includes('\\n') ? text.replace(/\\n/g, '\n') : text);
}

function agemin(o: {
  asset: string;
  secret: string;
  api: string;
  verify: string;
  publicKey: string | null;
}): AgeProvider {
  const auth = { authorization: `Bearer ${o.secret}` };
  let key: { value: KeyObject; until: number } | null = o.publicKey
    ? { value: pemKey(o.publicKey), until: Number.POSITIVE_INFINITY }
    : null;
  const publicKey = async (): Promise<KeyObject> => {
    if (key && key.until > Date.now()) return key.value;
    const res = await fetch(`${o.api}/v1/webhooks/public_key`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`agemin public key answered ${res.status}`);
    const text = await res.text();
    const pem = text.trim().startsWith('{') ? String(JSON.parse(text).public_key ?? '') : text;
    key = { value: pemKey(pem), until: Date.now() + 86_400_000 };
    return key.value;
  };
  return {
    id: 'agemin',
    startUrl(reference, back, locale) {
      const url = new URL(`${o.verify}/start/${encodeURIComponent(o.asset)}`);
      url.searchParams.set('reference_id', reference);
      url.searchParams.set('locale', locale);
      url.searchParams.set('mode', 'embedded');
      url.searchParams.set('success_url', back('done'));
      url.searchParams.set('error_url', back('error'));
      url.searchParams.set('cancel_url', back('cancel'));
      return url.toString();
    },
    async lookup(reference) {
      const res = await fetch(
        `${o.api}/v1/agemin/check/reference/${encodeURIComponent(reference)}`,
        { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`agemin lookup answered ${res.status}`);
      const body = (await res.json()) as { result?: AgeminResult | null };
      return body.result ? fromAgemin(body.result, null, null) : null;
    },
    async notice(body, headers) {
      const header = headers['x-bynn-signature'];
      const token =
        (typeof header === 'string' ? header : null) ??
        (body && typeof body === 'object' && typeof (body as { jwt?: unknown }).jwt === 'string'
          ? (body as { jwt: string }).jwt
          : null);
      if (!token) return null;
      const claims = readRs256(token, await publicKey(), Date.now());
      // The signed copy is the notice: nothing outside it is read.
      const data = claims?.data as
        | {
            event_type?: string;
            resource?: {
              reference?: string;
              method?: string;
              error_code?: string | null;
              result?: AgeminResult | null;
            };
          }
        | undefined;
      const r = data?.resource;
      if (!data || !r?.reference || !r.result) return null;
      if (
        data.event_type !== 'age.verification.approved' &&
        data.event_type !== 'age.verification.rejected'
      )
        return null;
      const method =
        r.method === 'id_document' || r.method === 'document' ? 'id_document' : r.method;
      return { reference: r.reference, result: fromAgemin(r.result, method, r.error_code ?? null) };
    },
    async ping() {
      // A reference nobody made: answered 404 with the key, 401 without a good one.
      const res = await fetch(`${o.api}/v1/agemin/check/reference/caime-health-probe`, {
        headers: auth,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status !== 404 && !res.ok) throw new Error(`agemin answered ${res.status}`);
    },
  };
}
