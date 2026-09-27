/**
 * The service worker (public/sw.js) in a fake worker scope: what a push shows, when it shows
 * nothing, and where a tapped notification leads.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  load();
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
