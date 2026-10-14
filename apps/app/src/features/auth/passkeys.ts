/**
 * Passkeys in the browser (R36): the server's WebAuthn options in their JSON form turned into
 * what `navigator.credentials` takes, and the credential it makes or finds turned back into
 * JSON for the server to check. Loaded only when someone adds a passkey or signs in with one (a
 * dynamic import), so the first screen carries none of it. Web only: a phone signs in with a
 * passkey once the store builds carry Caime's associated domain.
 */
import { tr } from '@caime/core/i18n';
import { endpoints } from '@/api/endpoints';

const fromB64 = (s: string): ArrayBuffer => {
  const bin = atob(
    s
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(s.length / 4) * 4, '='),
  );
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};
const toB64 = (b: ArrayBuffer | null): string | undefined => {
  if (!b) return undefined;
  let s = '';
  for (const byte of new Uint8Array(b)) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

type Descriptor = { id: string; type: 'public-key'; transports?: AuthenticatorTransport[] };
const descriptors = (list: unknown) =>
  ((list as Descriptor[] | undefined) ?? []).map((d) => ({ ...d, id: fromB64(d.id) }));

/** Whether this browser can make and use a passkey at all. */
export const passkeysSupported = () =>
  typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';

/** What went wrong, in the person's words: never the browser's own. */
export function passkeyProblem(err: unknown): string | null {
  const name = (err as { name?: string } | null)?.name;
  // Cancelled, or the browser's time ran out: they chose not to, nothing to say.
  if (name === 'NotAllowedError' || name === 'AbortError') return null;
  if (name === 'InvalidStateError')
    return tr('This device already has a passkey for your account.');
  if (name === 'NotSupportedError' || name === 'SecurityError')
    return tr('This browser can’t use passkeys here.');
  return (err as Error)?.message ?? tr('Something went wrong. Try again.');
}

/** A new passkey for the signed-in account, after the password; answers what the server kept. */
export async function addPasskey(password: string) {
  if (!passkeysSupported()) throw Object.assign(new Error(), { name: 'NotSupportedError' });
  const { challengeId, options } = await endpoints.startPasskey(password);
  const o = options as Record<string, unknown> & { user: { id: string } };
  const made = (await navigator.credentials.create({
    publicKey: {
      ...(o as unknown as PublicKeyCredentialCreationOptions),
      challenge: fromB64(o.challenge as string),
      user: { ...(o.user as unknown as PublicKeyCredentialUserEntity), id: fromB64(o.user.id) },
      excludeCredentials: descriptors(o.excludeCredentials),
    },
  })) as PublicKeyCredential | null;
  if (!made) throw Object.assign(new Error(), { name: 'NotAllowedError' });
  const r = made.response as AuthenticatorAttestationResponse;
  return endpoints.addPasskey({
    challengeId,
    credential: {
      id: made.id,
      rawId: toB64(made.rawId),
      type: made.type,
      response: {
        clientDataJSON: toB64(r.clientDataJSON),
        attestationObject: toB64(r.attestationObject),
        transports: typeof r.getTransports === 'function' ? r.getTransports() : [],
      },
      clientExtensionResults: made.getClientExtensionResults(),
      authenticatorAttachment: made.authenticatorAttachment ?? undefined,
    },
  });
}

/** Signing in with whichever passkey this device holds for Caime: answers as a password's sign-in. */
export async function signInWithPasskey(device: { client: 'web' | 'native'; deviceName?: string }) {
  if (!passkeysSupported()) throw Object.assign(new Error(), { name: 'NotSupportedError' });
  const { options } = await endpoints.passkeySignInOptions();
  const o = options as Record<string, unknown>;
  const found = (await navigator.credentials.get({
    publicKey: {
      ...(o as unknown as PublicKeyCredentialRequestOptions),
      challenge: fromB64(o.challenge as string),
      allowCredentials: descriptors(o.allowCredentials),
    },
  })) as PublicKeyCredential | null;
  if (!found) throw Object.assign(new Error(), { name: 'NotAllowedError' });
  const r = found.response as AuthenticatorAssertionResponse;
  return endpoints.passkeySignIn({
    credential: {
      id: found.id,
      rawId: toB64(found.rawId),
      type: found.type,
      response: {
        clientDataJSON: toB64(r.clientDataJSON),
        authenticatorData: toB64(r.authenticatorData),
        signature: toB64(r.signature),
        userHandle: toB64(r.userHandle),
      },
      clientExtensionResults: found.getClientExtensionResults(),
      authenticatorAttachment: found.authenticatorAttachment ?? undefined,
    },
    client: device.client,
    deviceName: device.deviceName,
  });
}
