/**
 * Google's and Microsoft's stand-in for end-to-end runs (R89): their consent pages (given at
 * once, as a person who taps Allow), their token endpoints (which only Caime's server calls,
 * with the client's secret) and the contacts APIs the browser reads itself, with CORS as the
 * real ones answer. What an account holds is set by the test (`POST /people`), and every request
 * is listed at `GET /requests` with whether a browser made it (an Origin header) and the access
 * it carried, so a test can tell the access reached the browser and nothing else.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8794);
const ACCESS = { google: 'google-e2e-access', microsoft: 'microsoft-e2e-access' };
const SECRETS = { google: 'google-e2e-secret', microsoft: 'microsoft-e2e-secret' };
let people = {
  google: { connections: [], otherContacts: [] },
  microsoft: { contacts: [], people: [] },
};
const requests = [];

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, accept',
  'access-control-allow-methods': 'GET, OPTIONS',
};
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};
const form = async (req) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return Object.fromEntries(new URLSearchParams(raw));
};
/** One page of a list, a thousand at a time as the real ones give, with the next one named. */
const page = (list, at, size) => ({
  items: list.slice(at, at + size),
  next: at + size < list.length ? at + size : null,
});

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://stub');
  const path = url.pathname;
  if (path === '/health') return json(res, 200, { ok: true });
  if (path === '/requests' && req.method === 'GET') return json(res, 200, { requests });
  if (path === '/people' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    people = { ...people, ...JSON.parse(raw || '{}') };
    requests.length = 0;
    return json(res, 200, { ok: true });
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  requests.push({
    method: req.method,
    path,
    browser: Boolean(req.headers.origin),
    access: bearer || null,
  });

  // Consent, given at once: back to Caime's server with a code and the state as it came.
  const consent =
    path === '/google/auth'
      ? 'google'
      : path === '/common/oauth2/v2.0/authorize'
        ? 'microsoft'
        : null;
  if (consent) {
    const back = new URL(url.searchParams.get('redirect_uri') ?? '');
    back.searchParams.set('code', `${consent}-e2e-code`);
    back.searchParams.set('state', url.searchParams.get('state') ?? '');
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }
  const token =
    path === '/google/token' ? 'google' : path === '/common/oauth2/v2.0/token' ? 'microsoft' : null;
  if (token && req.method === 'POST') {
    const f = await form(req);
    if (f.client_secret !== SECRETS[token] || f.code !== `${token}-e2e-code`)
      return json(res, 400, { error: 'invalid_grant' });
    return json(res, 200, {
      access_token: ACCESS[token],
      token_type: 'Bearer',
      expires_in: 3599,
      scope:
        token === 'google'
          ? 'https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly'
          : 'https://graph.microsoft.com/Contacts.Read https://graph.microsoft.com/People.Read',
    });
  }

  // The contacts APIs, read by the browser with the access.
  if (path === '/v1/people/me/connections' || path === '/v1/otherContacts') {
    if (bearer !== ACCESS.google) return json(res, 401, { error: { code: 401 } }, cors);
    const which = path === '/v1/otherContacts' ? 'otherContacts' : 'connections';
    const at = Number(url.searchParams.get('pageToken') ?? 0);
    const p = page(people.google[which], at, 1000);
    return json(
      res,
      200,
      { [which]: p.items, ...(p.next ? { nextPageToken: String(p.next) } : {}) },
      cors,
    );
  }
  if (path === '/v1.0/me/contacts' || path === '/v1.0/me/people') {
    if (bearer !== ACCESS.microsoft)
      return json(res, 401, { error: { code: 'InvalidAuthenticationToken' } }, cors);
    const which = path.endsWith('/contacts') ? 'contacts' : 'people';
    const at = Number(url.searchParams.get('$skip') ?? 0);
    const p = page(people.microsoft[which], at, 999);
    const next = p.next ? `http://graph.example${path}?$skip=${p.next}` : null;
    return json(res, 200, { value: p.items, ...(next ? { '@odata.nextLink': next } : {}) }, cors);
  }
  json(res, 404, { error: 'not here' });
}).listen(PORT, '127.0.0.1');
