/**
 * A software authenticator for the passkey tests (R36): a P-256 key made here, answering a
 * ceremony's options as a browser and a platform authenticator would, so the server's real
 * WebAuthn verification runs on real attestation and assertion bytes ("none" attestation, a
 * synced passkey: BE and BS set). `origin` is where it believes it is, to test a phishing page.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const b64 = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64url');
const u16 = (n: number) => Buffer.from([(n >> 8) & 0xff, n & 0xff]);
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
// User present, user verified, backup eligible, backed up; attested credential data on create.
const UP = 0x01;
const UV = 0x04;
const BE = 0x08;
const BS = 0x10;
const AT = 0x40;

export function softAuthenticator(origin: string, rpId = new URL(origin).hostname) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(32);
  const id = b64(credentialId);
  const rpIdHash = createHash('sha256').update(rpId).digest();
  let counter = 0;
  let userHandle = '';
  return {
    id,
    /** Answers registration options (`PublicKeyCredentialCreationOptionsJSON`). */
    create(options: Record<string, unknown>, as = origin) {
      userHandle = (options.user as { id: string }).id;
      const cose = new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, new Uint8Array(Buffer.from(jwk.x ?? '', 'base64url'))],
        [-3, new Uint8Array(Buffer.from(jwk.y ?? '', 'base64url'))],
      ]);
      const authData = Buffer.concat([
        rpIdHash,
        Buffer.from([UP | UV | BE | BS | AT]),
        u32(counter),
        Buffer.alloc(16),
        u16(credentialId.length),
        credentialId,
        Buffer.from(isoCBOR.encode(cose)),
      ]);
      const statement = new Map<string, string>();
      const attestation = isoCBOR.encode(
        new Map<string, string | Map<string, string> | Uint8Array>([
          ['fmt', 'none'],
          ['attStmt', statement],
          ['authData', new Uint8Array(authData)],
        ]),
      );
      const clientData = JSON.stringify({
        type: 'webauthn.create',
        challenge: options.challenge,
        origin: as,
        crossOrigin: false,
      });
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: {
          clientDataJSON: b64(clientData),
          attestationObject: b64(attestation),
          transports: ['internal', 'hybrid'],
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
    /** Answers sign-in options (`PublicKeyCredentialRequestOptionsJSON`). */
    get(options: Record<string, unknown>, as = origin, handle = userHandle) {
      counter += 1;
      const authData = Buffer.concat([rpIdHash, Buffer.from([UP | UV | BE | BS]), u32(counter)]);
      const clientData = Buffer.from(
        JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: as }),
      );
      const signed = Buffer.concat([authData, createHash('sha256').update(clientData).digest()]);
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: {
          clientDataJSON: b64(clientData),
          authenticatorData: b64(authData),
          signature: b64(sign('sha256', signed, privateKey)),
          userHandle: handle,
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
  };
}
