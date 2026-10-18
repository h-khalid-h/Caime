/**
 * Link previews (M16 E4c): a stand-in site serves pages and pictures; the server reads the page
 * of a text's first link once, keeps its words and its own small copy of the picture by the
 * address's hash, tells the conversation, serves the picture itself, and asks the site again
 * only once the month is up. Nothing for a link taken off, a suspicious one, mail or a sealed
 * message; nothing kept from a page that's busy; nothing left of a page once its message is
 * erased; and never an address on a private network.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { uuidv4 } from '@caime/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { runDueJobs } from '../src/lib/jobs';
import { previewedLink, previewIdOf, previewUrl } from '../src/lib/link-preview-views';
import { decodeEntities, decodePage, linkTarget, readPage } from '../src/lib/link-previews';
import { sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp, until } from './helpers';

let site: Server;
let base: string;
let t: TestApp;
let ana: Client;
let ben: Client;
let cleo: Client;
let convo: string;
const asked: string[] = [];
let picture: Buffer;
let tiny: Buffer;
let busy = true;

const page = (head: string) => `<!doctype html><html><head>${head}</head><body>Hello</body></html>`;

// "مرحبا بكم" in windows-1256, a charset an Arabic site may still name.
const arabic = Buffer.concat([
  Buffer.from(
    '<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1256"><title>',
  ),
  Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7, 0x20, 0xc8, 0xdf, 0xe3]),
  Buffer.from('</title></head><body></body></html>'),
]);

function serve(path: string): { status: number; type: string; body: Buffer | string; gzip?: true } {
  switch (path) {
    case '/article':
      return {
        status: 200,
        type: 'text/html; charset=utf-8',
        body: page(`<title>Ignored</title>
          <meta property="og:title" content="Caf&eacute; &amp; Bar &#8212; menu">
          <meta property="og:description" content="  Open   late,
            every day. ">
          <meta property="og:site_name" content="The Corner">
          <meta property="og:image" content="/pic.png">
          <!-- <meta property="og:title" content="A comment, never read"> -->`),
      };
    case '/gz':
      return {
        status: 200,
        type: 'text/html',
        body: page('<meta name="description" content="Squeezed and read"><title>Packed</title>'),
        gzip: true,
      };
    case '/tiny':
      return {
        status: 200,
        type: 'text/html',
        body: page('<title>A tiny icon</title><meta property="og:image" content="/tiny.png">'),
      };
    case '/arabic':
      return { status: 200, type: 'text/html', body: arabic };
    case '/nothing':
      return { status: 200, type: 'text/html', body: page('') };
    case '/data':
      return { status: 200, type: 'application/json', body: '{"title":"not a page"}' };
    case '/busy':
      return busy
        ? { status: 503, type: 'text/plain', body: 'later' }
        : { status: 200, type: 'text/html', body: page('<title>Up again</title>') };
    case '/pic.png':
      return { status: 200, type: 'image/png', body: picture };
    case '/tiny.png':
      return { status: 200, type: 'image/png', body: tiny };
    default:
      if (path.startsWith('/other/'))
        return { status: 200, type: 'text/html', body: page(`<title>Page ${path}</title>`) };
      return { status: 404, type: 'text/plain', body: 'not here' };
  }
}

/** What was queued runs, as the worker would run it. */
const work = async () => {
  await t.ctx.flush();
  await runDueJobs(t.ctx);
};

const say = async (c: Client, conversation: string, body: string, extra = {}) =>
  (
    await c.post(`/v1/conversations/${conversation}/messages`, {
      clientId: uuidv4(),
      body,
      ...extra,
    })
  ).message as { id: string; link: unknown; payload: Record<string, unknown> };

const read = async (c: Client, conversation: string, id: string) => {
  const got = await c.get(`/v1/conversations/${conversation}/messages?limit=50`);
  const m = (got.messages as Array<{ id: string; link: unknown }>).find((x) => x.id === id);
  if (!m) throw new Error(`message ${id} not in the page`);
  return m;
};

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}

beforeAll(async () => {
  picture = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .png()
    .toBuffer();
  tiny = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  site = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    asked.push(path);
    if (path === '/redirect') {
      res.writeHead(302, { location: '/article' });
      res.end();
      return;
    }
    const answer = serve(path);
    const body = answer.gzip ? gzipSync(answer.body) : answer.body;
    res.writeHead(answer.status, {
      'content-type': answer.type,
      ...(answer.gzip ? { 'content-encoding': 'gzip' } : {}),
    });
    res.end(body);
  });
  await new Promise<void>((done) => site.listen(0, '127.0.0.1', done));
  base = `http://localhost:${(site.address() as AddressInfo).port}`;
  t = await createTestApp({ LINK_PREVIEWS: 'true', LINK_PREVIEWS_ALLOW_PRIVATE: 'true' });
  ana = await signup(t, { displayName: 'Ana Links', email: 'ana.links@example.com' });
  ben = await signup(t, { displayName: 'Ben Links', email: 'ben.links@example.com' });
  cleo = await signup(t, { displayName: 'Cleo Links', email: 'cleo.links@example.com' });
  convo = await connect(ana, ben);
});

afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => site.close(() => done()));
});

describe('a link’s page, read once on the server (M16 E4c)', () => {
  it('reads the page and its picture once, tells the conversation, and serves the picture itself', async () => {
    const heard: BusMessage[] = [];
    const off = t.ctx.bus.subscribe((msg) => heard.push(msg));
    const sent = await say(ana, convo, `Dinner here? ${base}/article`);
    // Not read yet: the card comes when the page has been.
    expect(sent.link).toBeNull();
    await work();
    const told = () =>
      heard.filter(
        (h) =>
          h.event.type === 'message.updated' && (h.event.data as { id?: string }).id === sent.id,
      );
    await until(() => told().length > 0, 5_000, 'the card told');
    off();
    // One view to everyone in it, as a transcript is.
    expect(told()).toHaveLength(1);
    expect([...told()[0]!.userIds].sort()).toEqual([ana.user.id, ben.user.id].sort());
    const id = previewIdOf(`${base}/article`);
    const link = (await read(ben, convo, sent.id)).link;
    expect(link).toEqual({
      url: `${base}/article`,
      title: 'Café & Bar — menu',
      description: 'Open late, every day.',
      siteName: 'The Corner',
      imageUrl: `/v1/links/${id}/image`,
      imageWidth: 960,
      imageHeight: 504,
    });
    expect(asked.filter((p) => p === '/article')).toHaveLength(1);
    expect(asked.filter((p) => p === '/pic.png')).toHaveLength(1);
    // The picture is Caime's own small copy, from Caime.
    const pic = await ben.req('GET', `/v1/links/${id}/image`);
    expect(pic.statusCode).toBe(200);
    expect(pic.headers['content-type']).toBe('image/webp');
    const meta = await sharp(pic.rawPayload).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 960, 504]);
    // Nobody signed out gets it, and an id that isn't one finds nothing.
    expect((await t.app.inject({ method: 'GET', url: `/v1/links/${id}/image` })).statusCode).toBe(
      401,
    );
    expect((await ben.req('GET', `/v1/links/${'0'.repeat(64)}/image`)).statusCode).toBe(404);
    // The same link elsewhere has its card at once, and the site isn't asked again.
    const other = await connect(ana, cleo);
    const again = await say(ana, other, `${base}/article#menu is the place`);
    expect((again.link as { title: string }).title).toBe('Café & Bar — menu');
    await work();
    expect(asked.filter((p) => p === '/article')).toHaveLength(1);
    // Nothing kept says whose link it was, or even the address.
    const row = await t.ctx.db
      .selectFrom('link_previews')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify({ ...row, image: null })).not.toContain('article');
  });

  it('follows a redirect, unpacks gzip, reads a page’s own charset, and keeps no icon as a picture', async () => {
    const redirected = await say(ana, convo, `${base}/redirect`);
    const packed = await say(ana, convo, `${base}/gz`);
    const arabicPage = await say(ana, convo, `${base}/arabic`);
    const iconic = await say(ana, convo, `${base}/tiny`);
    await work();
    expect((await read(ana, convo, redirected.id)).link).toMatchObject({
      url: `${base}/redirect`,
      title: 'Café & Bar — menu',
    });
    expect((await read(ana, convo, packed.id)).link).toMatchObject({
      title: 'Packed',
      description: 'Squeezed and read',
      imageUrl: null,
    });
    expect((await read(ana, convo, arabicPage.id)).link).toMatchObject({ title: 'مرحبا بكم' });
    expect((await read(ana, convo, iconic.id)).link).toMatchObject({
      title: 'A tiny icon',
      imageUrl: null,
      imageWidth: null,
    });
  });

  it('keeps a page that says nothing as nothing, asked once; a busy one isn’t kept, so it’s asked again', async () => {
    const quiet = await say(ana, convo, `${base}/nothing`);
    const data = await say(ana, convo, `${base}/data`);
    await work();
    expect((await read(ana, convo, quiet.id)).link).toBeNull();
    expect((await read(ana, convo, data.id)).link).toBeNull();
    await say(ana, convo, `again ${base}/nothing`);
    await work();
    expect(asked.filter((p) => p === '/nothing')).toHaveLength(1);
    // Busy: nothing kept, and the next time it's sent it's asked again.
    const first = await say(ana, convo, `${base}/busy`);
    await work();
    expect((await read(ana, convo, first.id)).link).toBeNull();
    busy = false;
    const second = await say(ana, convo, `${base}/busy now`);
    await work();
    expect((await read(ana, convo, second.id)).link).toMatchObject({ title: 'Up again' });
    expect(asked.filter((p) => p === '/busy')).toHaveLength(2);
  });

  it('reads nothing for a link taken off or a suspicious one', async () => {
    const before = asked.length;
    const off = await say(ana, convo, `${base}/other/off`, { linkPreview: false });
    expect(off.payload).toEqual({ noPreview: true });
    // A text without a link keeps no mark, whatever the flag says.
    expect((await say(ana, convo, 'just words', { linkPreview: false })).payload).toEqual({});
    const phishy = await say(ana, convo, 'Your parcel: http://dhl-delivery-support.tk/track');
    await t.ctx.flush();
    const queued = await t.ctx.db
      .selectFrom('jobs')
      .select('payload')
      .where('kind', '=', 'links.preview')
      .execute();
    const ids = queued.map((j) => (j.payload as { messageId: string }).messageId);
    expect(ids).not.toContain(off.id);
    expect(ids).not.toContain(phishy.id);
    await work();
    expect(asked.length).toBe(before);
    expect((await read(ben, convo, off.id)).link).toBeNull();
    // A text's payload is still the server's alone: the flag is the only way to say it.
    const forged = await ana.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: `${base}/other/forged`,
      payload: { noPreview: true },
    });
    expect(forged.statusCode).toBe(400);
  });

  it('the composer’s card reads the page before it’s sent, and the message has it from the start', async () => {
    const url = `${base}/other/composer`;
    const got = await ana.get(`/v1/links/preview?url=${encodeURIComponent(url)}`);
    expect(got.preview).toMatchObject({ url, title: 'Page /other/composer' });
    const sent = await say(ana, convo, `see ${url}`);
    expect(sent.link).toMatchObject({ title: 'Page /other/composer' });
    await work();
    expect(asked.filter((p) => p === '/other/composer')).toHaveLength(1);
    // Nothing for what isn't an address, or a suspicious one.
    expect((await ana.get('/v1/links/preview?url=not%20a%20link')).preview).toBeNull();
    expect(
      (await ana.get(`/v1/links/preview?url=${encodeURIComponent('http://paypa1.tk/login')}`))
        .preview,
    ).toBeNull();
  });

  it('an edit’s new link gets its card; erasing the message drops the page read for it', async () => {
    const sent = await say(ana, convo, 'the plan is in the doc');
    expect(sent.link).toBeNull();
    const url = `${base}/other/edited`;
    await ana.patch(`/v1/messages/${sent.id}`, { body: `the plan is at ${url}` });
    await work();
    expect((await read(ben, convo, sent.id)).link).toMatchObject({
      url,
      title: 'Page /other/edited',
    });
    const id = previewIdOf(url);
    const kept = () =>
      t.ctx.db.selectFrom('link_previews').select('id').where('id', '=', id).executeTakeFirst();
    expect(await kept()).toBeDefined();
    const res = await ana.req('DELETE', `/v1/messages/${sent.id}`);
    expect(res.statusCode).toBe(200);
    await work();
    expect(await kept()).toBeUndefined();
  });

  it('forgets a page once its month is up, and reads it again the next time it’s sent', async () => {
    const url = `${base}/other/monthly`;
    await say(ana, convo, url);
    await work();
    const id = previewIdOf(url);
    const kept = () =>
      t.ctx.db.selectFrom('link_previews').select('id').where('id', '=', id).executeTakeFirst();
    expect(await kept()).toBeDefined();
    await t.ctx.db
      .updateTable('link_previews')
      .set({ fetched_at: new Date(t.clock.now.getTime() - 31 * 86_400_000) })
      .where('id', '=', id)
      .execute();
    await sweepRecords(t.ctx);
    expect(await kept()).toBeUndefined();
    await say(ana, convo, `back to ${url}`);
    await work();
    expect(asked.filter((p) => p === '/other/monthly')).toHaveLength(2);
  });
});

describe('what may be read, and how a page is read', () => {
  it('asks only public http(s) addresses on their own ports, with no password', () => {
    const ok = (raw: string) => linkTarget(raw, false) !== null;
    expect(ok('https://example.com/a?b=c')).toBe(true);
    expect(ok('http://example.com:80/')).toBe(true);
    expect(ok('https://93.184.216.34/')).toBe(true);
    for (const refused of [
      'http://127.0.0.1/',
      'http://10.1.2.3/admin',
      'http://169.254.169.254/latest/meta-data/',
      'https://[::1]/',
      'https://[::ffff:7f00:1]/',
      'http://localhost/',
      'http://printer.local/',
      'http://intranet/',
      'https://db.internal/',
      'https://example.com:8443/',
      'https://user:secret@example.com/',
      'ftp://example.com/file',
      'javascript:alert(1)',
    ])
      expect(ok(refused), refused).toBe(false);
  });

  it('previews a text’s first link only, never a sealed message, mail or a suspicious first link', () => {
    const text = (links: Array<{ url: string; suspicious?: boolean }>, extra = {}) => ({
      kind: 'text' as const,
      sealed: null,
      deleted_at: null,
      channel: null,
      payload: {},
      entities: { links },
      ...extra,
    });
    expect(previewedLink(text([{ url: 'www.example.com/x#top' }, { url: 'https://b.com' }]))).toBe(
      'https://www.example.com/x',
    );
    expect(
      previewedLink(text([{ url: 'https://a.tk', suspicious: true }, { url: 'https://b.com' }])),
    ).toBeNull();
    expect(previewedLink(text([{ url: 'https://a.com' }], { sealed: { v: 1 } }))).toBeNull();
    expect(previewedLink(text([{ url: 'https://a.com' }], { channel: 'mail' }))).toBeNull();
    expect(
      previewedLink(text([{ url: 'https://a.com' }], { payload: { noPreview: true } })),
    ).toBeNull();
    expect(previewedLink(text([{ url: 'https://a.com' }], { kind: 'media' }))).toBeNull();
    expect(previewUrl('mailto:someone@example.com')).toBeNull();
    expect(previewUrl('example.com/no-scheme')).toBeNull();
    expect(previewUrl('https://user:secret@example.com/')).toBeNull();
  });

  it('reads Open Graph first, then the title and description, and decodes what it reads', () => {
    const facts = readPage(
      `<head><title>T &lt;1&gt;</title><meta name="description" content='One &quot;two&quot; &#x1F600;'>
       <link rel="image_src" href="//cdn.example.com/p.jpg"><script>var x = '<meta property="og:title" content="no">';</script></head>`,
      new URL('https://example.com/page'),
    );
    expect(facts).toEqual({
      title: 'T <1>',
      description: 'One "two" 😀',
      siteName: null,
      image: 'https://cdn.example.com/p.jpg',
    });
    expect(
      readPage(`<meta property="og:image" content="javascript:alert(1)">`, new URL('https://e.com'))
        .image,
    ).toBeNull();
    expect(decodeEntities('&unknown; &#xD800; &#0; &AMP;')).toBe('&unknown; &#xD800; &#0; &');
    expect(decodePage(arabic, 'text/html')).toContain('مرحبا بكم');
    // A long title is cut by character, never through one.
    const long = readPage(`<title>${'ب'.repeat(300)}</title>`, new URL('https://e.com')).title;
    expect([...(long ?? '')].length).toBe(200);
  });
});
