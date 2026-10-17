import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { accountReturnOf } from '@caime/core/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * Files from a connected account (R90): a OneDrive browsed through Caime's server, Google's
 * picked in Google's own picker (its page on Caime), and the one picked copied in as the person's
 * upload. A stand-in plays both providers' token, identity and drive endpoints.
 */
let t: TestApp;
let bare: TestApp;
let noor: Client;
let lina: Client;
let stub: Server;
let base: string;
let graphStatus = 200;
const seen: Array<{ path: string; auth?: string }> = [];

const PDF = Buffer.from('%PDF-1.4\n% a Google document, exported\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const NOTES = Buffer.from('Quarterly notes: the clinic opens on Sunday.\n');

const body = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => resolve(raw));
  });

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    await body(req);
    const url = new URL(req.url ?? '/', 'http://stub');
    const p = url.pathname;
    seen.push({ path: `${p}${url.search}`, auth: req.headers.authorization });
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    const bytes = (b: Buffer, type: string) => {
      res.writeHead(200, { 'content-type': type, 'content-length': String(b.length) });
      res.end(b);
    };
    if (p === '/google/token')
      return json(200, {
        access_token: 'g-access',
        expires_in: 3599,
        refresh_token: 'g-refresh',
        scope:
          'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/drive.file',
      });
    if (p === '/google/userinfo') return json(200, { sub: 'g-1', email: 'noor@gmail.example' });
    if (p === '/gcal/freeBusy') return json(200, { calendars: { primary: { busy: [] } } });
    if (p === '/drive/files/photo1' && !url.searchParams.has('alt'))
      return json(200, { id: 'photo1', name: 'clinic.png', mimeType: 'image/png', size: '68' });
    if (p === '/drive/files/photo1') return bytes(PNG, 'image/png');
    if (p === '/drive/files/doc1')
      return json(200, {
        id: 'doc1',
        name: 'Opening plan',
        mimeType: 'application/vnd.google-apps.document',
      });
    if (p === '/drive/files/doc1/export') return bytes(PDF, 'application/pdf');
    if (p === '/drive/files/form1')
      return json(200, {
        id: 'form1',
        name: 'Survey',
        mimeType: 'application/vnd.google-apps.form',
      });
    if (p.endsWith('/oauth2/v2.0/token'))
      return json(200, {
        access_token: 'm-access',
        expires_in: 3599,
        refresh_token: 'm-refresh',
        scope: 'openid email offline_access User.Read Calendars.ReadBasic Files.Read',
      });
    if (p === '/graph/v1.0/me')
      return json(200, { id: 'm-1', userPrincipalName: 'noor@work.example' });
    if (p === '/graph/v1.0/me/calendarView') return json(200, { value: [] });
    if (graphStatus !== 200) return json(graphStatus, { error: { code: 'nope' } });
    if (p === '/graph/v1.0/me/drive/root/children') {
      if (url.searchParams.get('page') === '2')
        return json(200, {
          value: [{ id: 'f3', name: 'zebra.txt', size: 4, file: { mimeType: 'text/plain' } }],
        });
      return json(200, {
        value: [
          { id: 'n1', name: 'notes.txt', size: NOTES.length, file: { mimeType: 'text/plain' } },
          { id: 'dir1', name: 'Clinic', folder: { childCount: 1 } },
          {
            id: 'huge',
            name: 'scan.tif',
            size: 200 * 1024 * 1024,
            file: { mimeType: 'image/tiff' },
          },
        ],
        '@odata.nextLink': `${base}/graph/v1.0/me/drive/root/children?page=2`,
      });
    }
    if (p === '/graph/v1.0/me/drive/items/dir1/children')
      return json(200, {
        value: [{ id: 'p1', name: 'plan.png', size: PNG.length, file: { mimeType: 'image/png' } }],
      });
    if (p.startsWith("/graph/v1.0/me/drive/root/search(q='clinic')"))
      return json(200, { value: [{ id: 'dir1', name: 'Clinic', folder: {} }] });
    if (p === '/graph/v1.0/me/drive/items/n1')
      return json(200, {
        id: 'n1',
        name: 'notes.txt',
        size: NOTES.length,
        file: { mimeType: 'text/plain' },
      });
    if (p === '/graph/v1.0/me/drive/items/dir1')
      return json(200, { id: 'dir1', name: 'Clinic', folder: {} });
    if (p === '/graph/v1.0/me/drive/items/huge')
      return json(200, {
        id: 'huge',
        name: 'scan.tif',
        size: 200 * 1024 * 1024,
        file: { mimeType: 'image/tiff' },
      });
    // OneDrive answers the content with a redirect to a pre-signed address that needs no access.
    if (p === '/graph/v1.0/me/drive/items/n1/content') {
      res.writeHead(302, { location: `${base}/blob/n1` });
      return res.end();
    }
    if (p === '/blob/n1') return bytes(NOTES, 'text/plain');
    json(404, {});
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  const clients = {
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    GOOGLE_AUTH_URL: `${base}/google/auth`,
    GOOGLE_TOKEN_URL: `${base}/google/token`,
    GOOGLE_USERINFO_URL: `${base}/google/userinfo`,
    GOOGLE_CALENDAR_API: `${base}/gcal`,
    GOOGLE_DRIVE_API: `${base}/drive`,
    MICROSOFT_CLIENT_ID: 'ms-client',
    MICROSOFT_CLIENT_SECRET: 'ms-secret',
    MICROSOFT_LOGIN_BASE: base,
    MICROSOFT_GRAPH_API: `${base}/graph`,
  };
  t = await createTestApp({
    ...clients,
    GOOGLE_PICKER_API_KEY: 'picker-browser-key',
    GOOGLE_PICKER_APP_ID: '123456789012',
  });
  bare = await createTestApp(clients);
  noor = await signup(t, { displayName: 'Noor Haddad' });
  lina = await signup(t, { displayName: 'Lina Farah' });
});

afterAll(async () => {
  await t.close();
  await bare.close();
  await new Promise((r) => stub.close(r));
});

/** Connects an account for these uses, through the consent's return and its claim. */
async function connect(who: Client, provider: 'google' | 'microsoft', uses: string[]) {
  const { url } = await who.post(`/v1/me/accounts/${provider}/start`, { uses, back: 'web' });
  const state = new URL(url).searchParams.get('state') ?? '';
  const res = await t.app.inject({
    method: 'GET',
    url: `/v1/accounts/${provider}/back?${new URLSearchParams({ code: 'one-time', state })}`,
  });
  const back = accountReturnOf(String(res.headers.location).split('#')[1] ?? '');
  if (!back || !('claim' in back)) throw new Error(`no claim: ${res.headers.location}`);
  return (await who.post(`/v1/me/accounts/${provider}/claim`, { claim: back.claim })).account;
}

describe('files from a connected account (R90)', () => {
  let ms: { id: string };
  let google: { id: string };

  it('offers Files where it can work: OneDrive always, Google only with its picker’s key', async () => {
    expect((await noor.get('/v1/me/accounts')).usesOffered).toEqual({
      google: ['calendar', 'plans', 'files'],
      microsoft: ['calendar', 'plans', 'files'],
    });
    const alone = await signup(bare);
    expect((await alone.get('/v1/me/accounts')).usesOffered.google).toEqual(['calendar', 'plans']);
    const refused = await alone.req('POST', '/v1/me/accounts/google/start', {
      uses: ['calendar', 'files'],
      back: 'web',
    });
    expect(refused.statusCode).toBe(400);
  });

  it('asks Microsoft for Files.Read and Google for drive.file, only when Files is turned on', async () => {
    const { url } = await noor.post('/v1/me/accounts/microsoft/start', {
      uses: ['calendar', 'files'],
      back: 'web',
    });
    expect(new URL(url).searchParams.get('scope')).toContain('Files.Read');
    const g = await noor.post('/v1/me/accounts/google/start', { uses: ['files'], back: 'web' });
    expect(new URL(g.url).searchParams.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/drive.file',
    );
    ms = await connect(noor, 'microsoft', ['calendar', 'files']);
    expect(ms).toMatchObject({ uses: ['calendar', 'files'] });
    google = await connect(noor, 'google', ['calendar', 'files']);
    expect(google).toMatchObject({ uses: ['calendar', 'files'] });
  });

  it('lists a OneDrive folders first, a page at a time, and follows only Graph’s own next page', async () => {
    const top = await noor.get(`/v1/me/accounts/${ms.id}/files`);
    expect(top.items.map((i: { name: string }) => i.name)).toEqual([
      'Clinic',
      'notes.txt',
      'scan.tif',
    ]);
    expect(top.items[0]).toMatchObject({ folder: true, size: null });
    expect(top.next).toBe(`${base}/graph/v1.0/me/drive/root/children?page=2`);
    const more = await noor.get(
      `/v1/me/accounts/${ms.id}/files?${new URLSearchParams({ next: top.next })}`,
    );
    expect(more.items.map((i: { name: string }) => i.name)).toEqual(['zebra.txt']);
    const elsewhere = await noor.req(
      'GET',
      `/v1/me/accounts/${ms.id}/files?${new URLSearchParams({ next: 'https://attacker.example/steal' })}`,
    );
    expect(elsewhere.statusCode).toBe(400);
    const inside = await noor.get(`/v1/me/accounts/${ms.id}/files?folder=dir1`);
    expect(inside.items.map((i: { name: string }) => i.name)).toEqual(['plan.png']);
    const found = await noor.get(`/v1/me/accounts/${ms.id}/files?q=clinic`);
    expect(found.items.map((i: { name: string }) => i.name)).toEqual(['Clinic']);
    // Only with the person's own access, sent only to the provider's API.
    expect(
      seen
        .filter((s) => s.path.startsWith('/graph/v1.0/me/drive'))
        .every((s) => s.auth === 'Bearer m-access'),
    ).toBe(true);
    // Google's are picked in Google's own picker, never listed here.
    expect((await noor.req('GET', `/v1/me/accounts/${google.id}/files`)).statusCode).toBe(400);
    // Nobody else's.
    expect((await lina.req('GET', `/v1/me/accounts/${ms.id}/files`)).statusCode).toBe(404);
  });

  it('copies a picked OneDrive file in as the person’s upload, and refuses a folder or a giant', async () => {
    seen.length = 0;
    const res = await noor.req('POST', `/v1/me/accounts/${ms.id}/files/import`, { fileId: 'n1' });
    expect(res.statusCode, res.body).toBe(201);
    const file = res.json().file;
    expect(file).toMatchObject({ name: 'notes.txt', size: NOTES.length });
    // The pre-signed address got no access: it's not the provider's API.
    expect(seen.find((s) => s.path === '/blob/n1')?.auth).toBeUndefined();
    const row = await t.ctx.db
      .selectFrom('files')
      .select(['owner_id', 'sha256'])
      .where('id', '=', file.id)
      .executeTakeFirstOrThrow();
    expect(row.owner_id).toBe(noor.user.id);
    // It goes into a message like any upload.
    const convo = (await noor.post('/v1/conversations', { kind: 'direct', userId: lina.user.id }))
      .conversation.id;
    const sent = await noor.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: crypto.randomUUID(),
      kind: 'file',
      fileIds: [file.id],
    });
    expect(sent.statusCode, sent.body).toBe(201);
    expect(
      (await noor.req('POST', `/v1/me/accounts/${ms.id}/files/import`, { fileId: 'dir1' }))
        .statusCode,
    ).toBe(400);
    const huge = await noor.req('POST', `/v1/me/accounts/${ms.id}/files/import`, {
      fileId: 'huge',
    });
    expect(huge.statusCode).toBe(413);
    expect(seen.some((s) => s.path.includes('/huge/content'))).toBe(false);
  });

  it('copies a Google file as it is, and a Google document as a PDF', async () => {
    const photo = await noor.req('POST', `/v1/me/accounts/${google.id}/files/import`, {
      fileId: 'photo1',
    });
    expect(photo.statusCode, photo.body).toBe(201);
    expect(photo.json().file).toMatchObject({ name: 'clinic.png', mime: 'image/png' });
    const doc = await noor.req('POST', `/v1/me/accounts/${google.id}/files/import`, {
      fileId: 'doc1',
    });
    expect(doc.statusCode, doc.body).toBe(201);
    expect(doc.json().file).toMatchObject({ name: 'Opening plan.pdf', mime: 'application/pdf' });
    expect(
      (await noor.req('POST', `/v1/me/accounts/${google.id}/files/import`, { fileId: 'form1' }))
        .statusCode,
    ).toBe(400);
  });

  it('opens Google’s picker on a page of its own, by a ticket good for five minutes', async () => {
    const { url } = await noor.post(`/v1/me/accounts/${google.id}/picker`, { back: 'app' });
    const page = await t.app.inject({
      method: 'GET',
      url: url.replace('http://localhost:8787', ''),
    });
    expect(page.statusCode).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    const csp = String(page.headers['content-security-policy']);
    expect(csp).toContain('https://apis.google.com');
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(page.body).toContain('caime://picked');
    expect(page.body).toContain('picker-browser-key');
    // The app's own pages never load Google's script.
    const app = await t.app.inject({
      method: 'GET',
      url: '/settings/apps',
      headers: { accept: 'text/html' },
    });
    expect(String(app.headers['content-security-policy'] ?? '')).not.toContain('apis.google.com');
    // Someone else's account isn't theirs to pick from; a stale ticket opens nothing.
    expect(
      (await lina.req('POST', `/v1/me/accounts/${google.id}/picker`, { back: 'web' })).statusCode,
    ).toBe(404);
    t.clock.advance(6 * 60_000);
    expect(
      (await t.app.inject({ method: 'GET', url: url.replace('http://localhost:8787', '') }))
        .statusCode,
    ).toBe(404);
    t.clock.advance(-6 * 60_000);
    // OneDrive has no picker page: it's browsed in Caime.
    expect(
      (await noor.req('POST', `/v1/me/accounts/${ms.id}/picker`, { back: 'web' })).statusCode,
    ).toBe(404);
  });

  it('needs Files turned on, and asks to connect again when the provider refuses', async () => {
    const other = await signup(t, { displayName: 'Omar Farouk' });
    const calendarOnly = await connect(other, 'microsoft', ['calendar']);
    expect((await other.req('GET', `/v1/me/accounts/${calendarOnly.id}/files`)).statusCode).toBe(
      403,
    );
    graphStatus = 401;
    const refused = await noor.req('GET', `/v1/me/accounts/${ms.id}/files`);
    graphStatus = 200;
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('account_reconnect');
    const after = (await noor.get('/v1/me/accounts')).accounts.find(
      (a: { id: string }) => a.id === ms.id,
    );
    expect(after.state).toBe('reconnect');
  });
});
