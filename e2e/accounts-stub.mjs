/**
 * Google's and Microsoft's stand-in for end-to-end runs (R89): their consent pages (given at
 * once, as a person who taps Allow), their token endpoints (which only Caime's server calls,
 * with the client's secret) and the contacts APIs the browser reads itself, with CORS as the
 * real ones answer. What an account holds is set by the test (`POST /people`), and every request
 * is listed at `GET /requests` with whether a browser made it (an Origin header) and the access
 * it carried, so a test can tell the access reached the browser and nothing else.
 *
 * Connected accounts (R90) too: a refresh token with every code, renewed accesses, who the
 * account is, a calendar's busy times (set by the test, `POST /busy`) and Google's revocation.
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
const REFRESH = { google: 'google-e2e-refresh', microsoft: 'microsoft-e2e-refresh' };
/** When the account's calendar is busy: `{ start, end }` in UTC. */
let busy = [];
const NOTE = Buffer.from('The clinic opens on Sunday at nine.\n');

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
  if (path === '/busy' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    busy = JSON.parse(raw || '[]');
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
    const renewing = f.grant_type === 'refresh_token';
    if (
      f.client_secret !== SECRETS[token] ||
      (renewing ? f.refresh_token !== REFRESH[token] : f.code !== `${token}-e2e-code`)
    )
      return json(res, 400, { error: 'invalid_grant' });
    return json(res, 200, {
      access_token: ACCESS[token],
      token_type: 'Bearer',
      expires_in: 3599,
      // Google renews with the same refresh token; Microsoft hands one with each access.
      ...(renewing && token === 'google' ? {} : { refresh_token: REFRESH[token] }),
      scope:
        token === 'google'
          ? 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly https://www.googleapis.com/auth/calendar.freebusy'
          : 'https://graph.microsoft.com/Contacts.Read https://graph.microsoft.com/People.Read https://graph.microsoft.com/Calendars.ReadBasic https://graph.microsoft.com/Files.Read',
    });
  }
  if (path === '/google/revoke' && req.method === 'POST') return json(res, 200, {});
  // Who the account is, and when its calendar is busy: only Caime's server asks.
  if (path === '/google/userinfo') {
    if (bearer !== ACCESS.google) return json(res, 401, {});
    return json(res, 200, { sub: 'google-e2e-subject', email: 'noor.e2e@gmail.example' });
  }
  if (path === '/gcal/freeBusy' && req.method === 'POST') {
    if (bearer !== ACCESS.google) return json(res, 401, {});
    return json(res, 200, { calendars: { primary: { busy } } });
  }
  if (path === '/v1.0/me') {
    if (bearer !== ACCESS.microsoft) return json(res, 401, {});
    return json(res, 200, {
      id: 'microsoft-e2e-subject',
      userPrincipalName: 'noor.e2e@outlook.example',
    });
  }
  // A OneDrive (R90): one folder with a note in it, read by Caime's server with the access; the
  // bytes come from a pre-signed address that needs none, as OneDrive's do.
  if (path.startsWith('/v1.0/me/drive/')) {
    if (bearer !== ACCESS.microsoft) return json(res, 401, {});
    const note = {
      id: 'note1',
      name: 'Clinic plan.txt',
      size: NOTE.length,
      file: { mimeType: 'text/plain' },
    };
    if (path === '/v1.0/me/drive/root/children')
      return json(res, 200, { value: [{ id: 'dir1', name: 'Clinic', folder: { childCount: 1 } }] });
    if (path === '/v1.0/me/drive/items/dir1/children') return json(res, 200, { value: [note] });
    if (path === '/v1.0/me/drive/items/note1') return json(res, 200, note);
    if (path === '/v1.0/me/drive/items/note1/content') {
      res.writeHead(302, { location: `http://127.0.0.1:${PORT}/blob/note1` });
      return res.end();
    }
  }
  if (path === '/blob/note1') {
    res.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(NOTE.length) });
    return res.end(NOTE);
  }
  if (path === '/v1.0/me/calendarView') {
    if (bearer !== ACCESS.microsoft) return json(res, 401, {});
    return json(res, 200, {
      value: busy.map((b) => ({
        start: { dateTime: b.start.replace(/Z$/, '') },
        end: { dateTime: b.end.replace(/Z$/, '') },
        showAs: 'busy',
      })),
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
