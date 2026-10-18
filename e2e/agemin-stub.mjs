/**
 * Agemin's stand-in for end-to-end runs (M16 B7): its own page (`/start/<asset>`, script-free:
 * three links, as a person who takes the selfie and is found 18 or over, or under, or who
 * cancels), the signed notice it then posts to Caime (`WEBHOOK_URL`, an RS256 JWT in
 * `X-Bynn-Signature` whose `data` is the body, made with a key of its own), the return to the
 * address Caime gave, the lookup by reference with the secret key, and the public key Caime reads
 * the notice with (`/v1/webhooks/public_key`). Every request is listed at `GET /requests`.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8793);
const SECRET = process.env.SECRET ?? 'age_sk_e2e_0123456789';
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? 'http://localhost:8787/v1/age/webhook/agemin';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
/** What the lookup answers, by reference. */
const results = new Map();
const requests = [];
let n = 0;

const b64url = (b) => Buffer.from(b).toString('base64url');
const jwt = (claims) => {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
};
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  requests.push({
    method: req.method,
    path: url.pathname,
    auth: req.headers.authorization ?? null,
  });
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (url.pathname === '/requests') return json(res, 200, requests);
  if (url.pathname === '/v1/webhooks/public_key') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(PEM);
  }
  const lookup = /^\/v1\/agemin\/check\/reference\/([^/]+)$/.exec(url.pathname);
  if (lookup) {
    if (req.headers.authorization !== `Bearer ${SECRET}`)
      return json(res, 401, { error: 'unauthorized' });
    const found = results.get(decodeURIComponent(lookup[1]));
    return found
      ? json(res, 200, { status: 'ok', reference: lookup[1], result: found })
      : json(res, 404, { error: 'not_found' });
  }
  if (url.pathname.startsWith('/start/')) {
    const q = url.searchParams;
    const answer = (outcome) =>
      `/answer?${new URLSearchParams({
        ref: q.get('reference_id') ?? '',
        outcome,
        back: (outcome === 'cancel' ? q.get('cancel_url') : q.get('success_url')) ?? '',
      })}`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Agemin</title></head>
<body><main><h1>Verify your age</h1><p>Reference ${esc(q.get('reference_id') ?? '')}</p>
<a href="${esc(answer('adult'))}">I'm 18 or over</a>
<a href="${esc(answer('underage'))}">I'm under 18</a>
<a href="${esc(answer('cancel'))}">Cancel</a></main></body></html>`);
  }
  if (url.pathname === '/answer') {
    const ref = url.searchParams.get('ref') ?? '';
    const outcome = url.searchParams.get('outcome');
    const back = url.searchParams.get('back') ?? '/';
    if (outcome === 'adult' || outcome === 'underage') {
      const passed = outcome === 'adult';
      const result = {
        session_token: `s${++n}`,
        verification_status: passed ? 'pass' : 'underage',
        passed,
        age_threshold: 18,
        confidence: 'high',
        is_adult: passed,
        is_of_age: passed,
      };
      results.set(ref, result);
      const body = {
        event_id: `evt_${n}`,
        created_at: new Date().toISOString(),
        event_type: passed ? 'age.verification.approved' : 'age.verification.rejected',
        resource: {
          session_id: `s${n}`,
          type: 'age_verification',
          reference: ref,
          method: 'biometric',
          result,
        },
      };
      const token = jwt({
        data: body,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bynn-signature': token },
        body: JSON.stringify({ ...body, jwt: token }),
      }).catch(() => {});
    }
    res.writeHead(302, { location: back });
    return res.end();
  }
  json(res, 404, { error: 'not_found' });
});

server.listen(PORT, '127.0.0.1');
