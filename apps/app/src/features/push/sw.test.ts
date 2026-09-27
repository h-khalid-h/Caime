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
let shown: Array<{ title: string; options: any }>;
let opened: string[];

function load() {
  listeners = {};
  shown = [];
  opened = [];
  const self = {
    location: { origin: 'https://caishy.example' },
    addEventListener: (type: string, f: Listener) => {
      listeners[type] = f;
    },
    skipWaiting: vi.fn(),
    registration: {
      showNotification: async (title: string, options: unknown) => {
        shown.push({ title, options });
      },
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
        options: expect.objectContaining({
          body: 'Are you coming?',
          tag: 'conversation:c1',
          requireInteraction: false,
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

  it('shows nothing while Caishy is open in front: the app shows it itself', async () => {
    tabs = [tab({ visibilityState: 'visible', focused: true })];
    await push({ id: 'n1', title: 'Hi', data: {} });
    expect(shown).toEqual([]);
    // Open in a tab behind another: it shows.
    tabs = [tab({ visibilityState: 'hidden' })];
    await push({ id: 'n2', title: 'Hi', data: {} });
    expect(shown).toHaveLength(1);
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
