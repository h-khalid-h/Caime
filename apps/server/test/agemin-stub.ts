/**
 * A stand-in for Agemin (M16 B7), as its documentation has it: the lookup by reference with the
 * secret key (`GET /v1/agemin/check/reference/:referenceId`, 401 without it, 404 for a reference
 * it never saw), the public key its notices are signed with (`GET /v1/webhooks/public_key`), and
 * `notice()`, the body and headers Agemin would post for an attempt: the JSON, with its signed
 * copy as an RS256 JWT in `X-Bynn-Signature` and in the body's `jwt`, whose `data` claim is the
 * body without it. Signed with this stand-in's own key, or with `key` to forge one.
 */
import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export const AGEMIN_SECRET = 'age_sk_test_caime_0123456789';
export const AGEMIN_ASSET = 'ast_test_caime';

export interface AgeminAttempt {
  passed: boolean;
  is_adult: boolean;
  verification_status: string;
  confidence: string;
  age_verification_method?: string;
  error_code?: string;
}

export interface AgeminStub {
  url: string;
  publicKeyPem: string;
  /** What the lookup answers for a reference: its latest passing attempt, else its latest. */
  results: Map<string, AgeminAttempt>;
  requests: Array<{ method: string; path: string; auth: string | undefined }>;
  /** An attempt as Agemin would post it, signed. */
  notice(
    reference: string,
    outcome: 'adult' | 'underage' | 'spoof',
    opts?: { document?: boolean; key?: KeyObject },
  ): { body: Record<string, unknown>; headers: Record<string, string> };
  close(): Promise<void>;
}

const b64url = (b: Buffer) => b.toString('base64url');

export function rs256(claims: Record<string, unknown>, key: KeyObject): string {
  const h = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const p = b64url(Buffer.from(JSON.stringify(claims)));
  return `${h}.${p}.${b64url(sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key))}`;
}

export function otherKey(): KeyObject {
  return generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
}

export async function ageminStub(): Promise<AgeminStub> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const results: AgeminStub['results'] = new Map();
  const requests: AgeminStub['requests'] = [];
  let n = 0;

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://stub').pathname;
    requests.push({ method: req.method ?? 'GET', path, auth: req.headers.authorization });
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (path === '/v1/webhooks/public_key') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(publicKeyPem);
      return;
    }
    const lookup = /^\/v1\/agemin\/check\/reference\/([^/]+)$/.exec(path);
    if (lookup) {
      if (req.headers.authorization !== `Bearer ${AGEMIN_SECRET}`)
        return send(401, { error: 'unauthorized' });
      const found = results.get(decodeURIComponent(lookup[1] as string));
      if (!found) return send(404, { error: 'not_found' });
      return send(200, {
        status: 'ok',
        reference: lookup[1],
        timestamp: new Date().toISOString(),
        result: { session_token: `s${++n}`, age_threshold: 18, ...found },
      });
    }
    send(404, { error: 'not_found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    publicKeyPem,
    results,
    requests,
    notice(reference, outcome, opts = {}) {
      const passed = outcome === 'adult';
      const body: Record<string, unknown> = {
        event_id: `evt_${++n}`,
        created_at: new Date().toISOString(),
        event_type: passed ? 'age.verification.approved' : 'age.verification.rejected',
        organization: { id: 'org_test', name: 'Caime' },
        resource: {
          session_id: `s${n}`,
          type: 'age_verification',
          reference,
          status: passed ? 'completed' : 'failed',
          method: opts.document ? 'id_document' : 'biometric',
          error_code: outcome === 'spoof' ? 'spoof_aegis' : null,
          result: {
            session_token: `s${n}`,
            verification_status: passed ? 'pass' : 'underage',
            passed,
            age_threshold: 18,
            confidence: 'high',
            is_adult: passed,
            is_of_age: passed,
          },
        },
      };
      const jwt = rs256(
        {
          data: body,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 600,
        },
        opts.key ?? privateKey,
      );
      return { body: { ...body, jwt }, headers: { 'x-bynn-signature': jwt } };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
