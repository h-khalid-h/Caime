/**
 * The service worker (public/sw.js) in a fake worker scope: what a push shows, when it shows
 * nothing, and where a tapped notification leads.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_PAGES } from '@caishy/core/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: any) => void;
let listeners: Record<string, Listener>;
let tabs: Array<{
  url: string;
  visibilityState: string;
  focused: boolean;
  postMessage: any;
  focus: any;
}>;
let shown: Array<{ title: string; options: any; closed: boolean }>;
let opened: string[];

/** A fake network and Cache Storage: what the server has, whether it's reachable, what's kept. */
type Res = { ok: boolean; status: number; body: string; type: string };
let server: Map<string, Res>;
let online: boolean;
let fetched: string[];
let kept: Map<string, Map<string, Res>>;
const res = (body: string, type = 'text/javascript', status = 200): Res => ({
  ok: status >= 200 && status < 300,
  status,
  body,
  type,
});
/** A response as the network gives it: its body can't be read once its request is aborted. */
const asResponse = (r: Res, signal?: AbortSignal): any => {
  const read = async () => {
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    return r.body;
  };
  return {
    ok: r.ok,
    status: r.status,
    statusText: '',
    body: r.body,
    headers: new Headers({ 'content-type': r.type }),
    clone: () => asResponse(r, signal),
    json: async () => JSON.parse(await read()),
    text: read,
  };
};
/** The app's page for build v`n`, naming its files as Expo's export does. */
const appPage = (n: number) =>
  `<!doctype html><title>Caishy v${n}</title><script src="/_expo/static/js/web/entry-v${n}.js"></script>`;
const pathOf = (x: string | { url: string }) =>
  new URL(typeof x === 'string' ? x : x.url, 'https://caishy.example').pathname;
const caches = {
  open: async (name: string) => {
    const c = kept.get(name) ?? new Map<string, Res>();
    kept.set(name, c);
    return {
      match: async (req: string | { url: string }) => {
        const hit = c.get(pathOf(req));
        return hit ? asResponse(hit) : undefined;
      },
      put: async (req: string | { url: string }, r: Response) =>
        void c.set(pathOf(req), {
          ok: r.ok,
          status: r.status,
          body: await r.text(),
          type: r.headers.get('content-type') ?? '',
        }),
      keys: async () => [...c.keys()].map((path) => ({ url: `https://caishy.example${path}` })),
      delete: async (req: { url: string }) => c.delete(pathOf(req)),
    };
  },
  keys: async () => [...kept.keys()],
  delete: async (name: string) => kept.delete(name),
};
const network = vi.fn(async (req: string | { url: string }, init?: { signal?: AbortSignal }) => {
  const path = pathOf(req);
  fetched.push(path);
  if (!online) throw new TypeError('Failed to fetch');
  // As the server does: any page is the app; anything shaped like a file must exist.
  const page = !/\.[a-z0-9]{2,5}$/i.test(path) && !path.startsWith('/v1/');
  const r =
    server.get(path) ??
    (page ? server.get('/') : undefined) ??
    res('{"error":{"code":"not_found"}}', 'application/json', 404);
  return asResponse(r, init?.signal);
});

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';

function load(userAgent = CHROME) {
  listeners = {};
  shown = [];
  opened = [];
  const self = {
    location: { origin: 'https://caishy.example' },
    navigator: { userAgent },
    addEventListener: (type: string, f: Listener) => {
      listeners[type] = f;
    },
    skipWaiting: vi.fn(),
    caches,
    fetch: network,
    registration: {
      showNotification: async (title: string, options: { tag?: string }) => {
        // One per tag, as browsers keep them: a new one takes an older one's place.
        shown = shown.filter((s) => !options.tag || s.options.tag !== options.tag || s.closed);
        shown.push({ title, options, closed: false });
      },
      getNotifications: async ({ tag }: { tag?: string } = {}) =>
        shown
          .filter((s) => !s.closed && (!tag || s.options.tag === tag))
          .map((s) => ({
            data: s.options.data,
            close: () => {
              s.closed = true;
            },
          })),
    },
    clients: {
      claim: vi.fn(),
      matchAll: async () => tabs,
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };
  new Function('self', readFileSync(join(__dirname, '../../../public/sw.js'), 'utf8'))(self);
}
async function fire(type: string, event: Record<string, unknown>) {
  let done: Promise<unknown> = Promise.resolve();
  listeners[type]?.({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
  await done;
}
const push = (payload: unknown) =>
  fire('push', { data: { json: () => payload, text: () => JSON.stringify(payload) } });
const tab = (over: Partial<(typeof tabs)[number]> = {}) => ({
  url: 'https://caishy.example/c/x',
  visibilityState: 'hidden',
  focused: false,
  postMessage: vi.fn(),
  focus: vi.fn(async () => {}),
  ...over,
});

beforeEach(() => {
  tabs = [];
  kept = new Map();
  fetched = [];
  online = true;
  server = new Map([
    ['/', res(appPage(2), 'text/html; charset=utf-8')],
    [
      '/app-files.json',
      res(
        JSON.stringify({
          files: ['/_expo/static/js/web/entry-v2.js', '/_expo/static/js/web/search-v2.js'],
        }),
        'application/json',
      ),
    ],
    ['/_expo/static/js/web/entry-v2.js', res('entry v2')],
    ['/_expo/static/js/web/search-v2.js', res('search v2')],
    ['/assets/font-1.ttf', res('font', 'font/ttf')],
  ]);
  load();
});

/** A fetch event as the browser sends one: what the worker answers with, if it does. */
async function request(url: string, init: { method?: string; mode?: string } = {}) {
  let answer: Promise<ReturnType<typeof asResponse>> | undefined;
  const waits: Promise<unknown>[] = [];
  listeners.fetch?.({
    request: {
      url: `https://caishy.example${url}`,
      method: init.method ?? 'GET',
      mode: init.mode ?? 'cors',
    },
    respondWith: (p: Promise<ReturnType<typeof asResponse>>) => {
      answer = p;
    },
    waitUntil: (p: Promise<unknown>) => void waits.push(p),
  });
  const r = answer ? await answer.catch((e: Error) => e) : undefined;
  await Promise.all(waits);
  return r;
}
const keptPaths = () => [...(kept.get('caishy-files-v1')?.keys() ?? [])].sort();

describe('the app kept for offline (PRD §49)', () => {
  it('a page is the network’s, and it’s kept with every file of its build', async () => {
    const page = (await request('/c/123', { mode: 'navigate' })) as any;
    expect(page.body).toContain('Caishy v2');
    expect(keptPaths()).toEqual([
      '/',
      '/_expo/static/js/web/entry-v2.js',
      '/_expo/static/js/web/search-v2.js',
    ]);
    // Offline, any page opens as the kept one, and its files come from what's kept.
    online = false;
    fetched = [];
    expect(((await request('/actions', { mode: 'navigate' })) as any).body).toContain('Caishy v2');
    expect(((await request('/_expo/static/js/web/search-v2.js')) as any).body).toBe('search v2');
    expect(fetched).toEqual(['/actions']);
  });

  it('opens the kept page while the server can’t answer, and says nothing kept when there’s none', async () => {
    online = false;
    expect(await request('/', { mode: 'navigate' })).toBeInstanceOf(TypeError);
    online = true;
    server.set('/', res('Bad gateway', 'text/html', 502));
    expect(((await request('/', { mode: 'navigate' })) as any).status).toBe(502);
    server.set('/', res(appPage(2), 'text/html'));
    await request('/', { mode: 'navigate' });
    server.set('/', res('Bad gateway', 'text/html', 502));
    expect(((await request('/', { mode: 'navigate' })) as any).body).toContain('Caishy v2');
  });

  it('a new build replaces the last only once all of it is kept, and the last one’s files go', async () => {
    await request('/', { mode: 'navigate' });
    server.set('/', res(appPage(3), 'text/html'));
    server.set(
      '/app-files.json',
      res(JSON.stringify({ files: ['/_expo/static/js/web/entry-v3.js'] }), 'application/json'),
    );
    // One of the new build's files can't be fetched: the page kept is still the last one.
    await request('/', { mode: 'navigate' });
    online = false;
    expect(((await request('/', { mode: 'navigate' })) as any).body).toContain('Caishy v2');
    online = true;
    server.set('/_expo/static/js/web/entry-v3.js', res('entry v3'));
    await request('/', { mode: 'navigate' });
    expect(keptPaths()).toEqual(['/', '/_expo/static/js/web/entry-v3.js']);
    online = false;
    expect(((await request('/', { mode: 'navigate' })) as any).body).toContain('Caishy v3');
  });

  it('keeps a file of a build as it’s first asked for, and never what the API answers', async () => {
    expect(((await request('/assets/font-1.ttf')) as any).body).toBe('font');
    fetched = [];
    expect(((await request('/assets/font-1.ttf')) as any).body).toBe('font');
    expect(fetched).toEqual([]);
    // A missing file is the network's answer, and isn't kept.
    expect(((await request('/_expo/static/js/web/gone.js')) as any).status).toBe(404);
    expect(keptPaths()).not.toContain('/_expo/static/js/web/gone.js');
    for (const [url, init] of [
      ['/v1/inbox', {}],
      ['/v1/conversations/c1/messages', { method: 'POST' }],
      ['/app-files.json', {}],
      ['/sw.js', {}],
      ['/_expo/static/js/web/entry-v2.js', { method: 'POST' }],
    ] as const)
      expect(await request(url, init), url).toBeUndefined();
  });

  it('as it installs, keeps the app already open; as it takes charge, drops what older ones kept', async () => {
    kept.set('caishy-old', new Map([['/x', res('old')]]));
    await fire('install', {});
    expect(keptPaths()).toContain('/_expo/static/js/web/entry-v2.js');
    // Taking charge downloads nothing: every request from the open tabs waits on it.
    fetched = [];
    await fire('activate', {});
    expect(fetched).toEqual([]);
    expect([...kept.keys()]).toEqual(['caishy-files-v1']);
  });

  it('keeps the page it installs with, however long its build takes to download', async () => {
    // Each request's deadline, in the test's hands: the page's passes while its build downloads.
    const deadlines: AbortController[] = [];
    const timeout = AbortSignal.timeout;
    const base = network.getMockImplementation()!;
    AbortSignal.timeout = () => {
      const c = new AbortController();
      deadlines.push(c);
      return c.signal;
    };
    network.mockImplementation(async (req, init) => {
      if (pathOf(req).startsWith('/_expo/')) deadlines[0]?.abort();
      return base(req, init);
    });
    try {
      await fire('install', {});
      expect(keptPaths()).toContain('/');
      online = false;
      expect(((await request('/', { mode: 'navigate' })) as any).body).toContain('Caishy');
    } finally {
      AbortSignal.timeout = timeout;
      network.mockImplementation(base);
    }
  });

  it('never keeps a page with another build’s list of files, nor lets it delete what it needs', async () => {
    await request('/', { mode: 'navigate' });
    // A deploy half done: the next build's page, with this build's list (or the other way round).
    server.set('/', res(appPage(3), 'text/html'));
    server.set('/_expo/static/js/web/entry-v3.js', res('entry v3'));
    await request('/', { mode: 'navigate' });
    expect(keptPaths()).toEqual([
      '/',
      '/_expo/static/js/web/entry-v2.js',
      '/_expo/static/js/web/search-v2.js',
    ]);
    online = false;
    expect(((await request('/', { mode: 'navigate' })) as any).body).toContain('Caishy v2');
  });

  it('never takes a page that isn’t the app for it: the server’s own, a portal’s sign-in', async () => {
    const notice = '<!doctype html><title>Down for a moment · Caishy</title><h1>Back soon</h1>';
    server.set('/maintenance', res(notice, 'text/html; charset=utf-8'));
    // Opened first, before the app ever was: nothing is kept.
    expect(((await request('/maintenance', { mode: 'navigate' })) as any).body).toBe(notice);
    expect(keptPaths()).toEqual([]);
    await request('/', { mode: 'navigate' });
    expect(((await request('/maintenance', { mode: 'navigate' })) as any).body).toBe(notice);
    // A network that answers every page with its own sign-in, with the list still reachable.
    server.set('/', res('<!doctype html><title>Sign in to the Wi-Fi</title>', 'text/html'));
    await request('/', { mode: 'navigate' });
    online = false;
    expect(((await request('/', { mode: 'navigate' })) as any).body).toContain('Caishy v2');
  });

  it('leaves Caishy’s own pages to the browser, online or not, never opening the app on one', async () => {
    await request('/', { mode: 'navigate' });
    for (const page of SITE_PAGES)
      for (const path of [`/${page}`, `/${page}/`]) {
        expect(await request(path, { mode: 'navigate' }), path).toBeUndefined();
        online = false;
        expect(await request(path, { mode: 'navigate' }), path).toBeUndefined();
        online = true;
      }
    expect(((await request('/helpers', { mode: 'navigate' })) as any).body).toContain('Caishy v2');
  });

  it('keeps a build’s fonts and images with it, and lets go of the last one’s', async () => {
    server.set(
      '/app-files.json',
      res(
        JSON.stringify({ files: ['/_expo/static/js/web/entry-v2.js', '/assets/font-1.ttf'] }),
        'application/json',
      ),
    );
    await request('/', { mode: 'navigate' });
    expect(keptPaths()).toContain('/assets/font-1.ttf');
    server.set(
      '/app-files.json',
      res(
        JSON.stringify({ files: ['/_expo/static/js/web/entry-v2.js', '/assets/font-2.ttf'] }),
        'application/json',
      ),
    );
    server.set('/assets/font-2.ttf', res('font 2', 'font/ttf'));
    await request('/', { mode: 'navigate' });
    expect(keptPaths()).toEqual(['/', '/_expo/static/js/web/entry-v2.js', '/assets/font-2.ttf']);
  });
});

describe('the service worker', () => {
  it('shows a push, one per thing it’s about, and a ring until it’s answered', async () => {
    await push({
      id: 'n1',
      title: 'Noor Haddad',
      body: 'Are you coming?',
      tag: 'conversation:c1',
      level: 'attention',
      data: { conversationId: 'c1' },
    });
    expect(shown).toEqual([
      {
        title: 'Noor Haddad',
        closed: false,
        options: expect.objectContaining({
          body: 'Are you coming?',
          tag: 'conversation:c1',
          requireInteraction: false,
          renotify: true,
          silent: false,
          data: { conversationId: 'c1', id: 'n1' },
        }),
      },
    ]);
    await push({ id: 'n2', title: 'Noor is calling', level: 'urgency', data: {} });
    expect(shown[1]?.options).toMatchObject({
      requireInteraction: true,
      renotify: true,
      tag: 'n2',
    });
  });

  it('something new alerts over an older one about the same thing; a ring that’s over is replaced quietly', async () => {
    await push({ id: 'n1', title: 'Nile Dental', body: 'Open Saturday', tag: 'update:o1' });
    await push({ id: 'n2', title: 'Nile Dental', body: 'Closed Monday', tag: 'update:o1' });
    expect(shown.map((s) => [s.options.body, s.options.renotify])).toEqual([
      ['Closed Monday', true],
    ]);
    await push({ id: 'r1', title: 'Noor is calling', level: 'urgency', tag: 'call:k1' });
    await push({
      id: 'r1',
      title: 'Noor Haddad',
      body: 'Answered',
      level: 'activity',
      tag: 'call:k1',
      quiet: true,
    });
    expect(shown.find((s) => s.options.tag === 'call:k1')?.options).toMatchObject({
      body: 'Answered',
      renotify: false,
      silent: true,
      requireInteraction: false,
    });
  });

  it('shows nothing while Caishy is open in front: the app shows it itself', async () => {
    tabs = [tab({ visibilityState: 'visible', focused: true })];
    await push({ id: 'n1', title: 'Hi', data: {} });
    expect(shown).toEqual([]);
    // Open in a tab behind another: it shows.
    tabs = [tab({ visibilityState: 'hidden' })];
    await push({ id: 'n2', title: 'Hi', data: {} });
    expect(shown).toHaveLength(1);
  });

  it('in Safari every push shows something, or it stops them: in front, quietly, and closed at once', async () => {
    load(SAFARI);
    tabs = [tab({ visibilityState: 'visible', focused: true })];
    await push({ id: 'n1', title: 'Hi', tag: 'conv:c1', data: {} });
    expect(shown).toEqual([
      expect.objectContaining({
        closed: true,
        options: expect.objectContaining({ silent: true, renotify: false }),
      }),
    ]);
    tabs = [];
    await push({ id: 'n2', title: 'Hi again', tag: 'conv:c2', data: {} });
    expect(shown.filter((s) => !s.closed).map((s) => s.title)).toEqual(['Hi again']);
  });

  it('a tapped notification moves the open tab there, or opens one', async () => {
    const open = tab();
    tabs = [open];
    const close = vi.fn();
    await fire('notificationclick', {
      notification: { close, data: { conversationId: 'c 1' } },
    });
    expect(close).toHaveBeenCalled();
    expect(open.postMessage).toHaveBeenCalledWith({ type: 'caishy.open', path: '/c/c%201' });
    expect(open.focus).toHaveBeenCalled();
    expect(opened).toEqual([]);

    tabs = [tab({ url: 'https://elsewhere.example/' })];
    for (const [data, path] of [
      [{ handle: 'nile.dental' }, '/o/nile.dental'],
      [{ userId: 'u1' }, '/p/u1'],
      [{}, '/notifications'],
    ] as const)
      await fire('notificationclick', { notification: { close, data } });
    expect(opened).toEqual(['/o/nile.dental', '/p/u1', '/notifications']);
  });
});
