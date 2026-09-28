import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const store = new Map<string, string>();
  const listeners = new Map<string, Array<() => void>>();
  return {
    store,
    listeners,
    storage: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    },
  };
});
vi.mock('@react-native-async-storage/async-storage', () => ({ default: h.storage }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
vi.mock('@/lib/network', () => ({ onNetworkChange: () => () => {} }));
vi.mock('./client', () => ({
  ApiError: class extends Error {},
  NetworkError: class extends Error {},
}));

const on = (target: string) => (type: string, fn: () => void) =>
  h.listeners.set(`${target}:${type}`, [...(h.listeners.get(`${target}:${type}`) ?? []), fn]);
const fire = (key: string) => {
  for (const fn of h.listeners.get(key) ?? []) fn();
};
let visibility = 'visible';
Object.assign(globalThis, {
  window: { addEventListener: on('window') },
  document: {
    addEventListener: on('document'),
    get visibilityState() {
      return visibility;
    },
  },
});

const { queryClient, saveCacheNow, saveCacheWhenLeft } = await import('./queryClient');
const saved = () => JSON.parse(h.store.get('caime.cache.v1') ?? 'null');
const keys = () =>
  (saved()?.clientState.queries ?? []).map((q: { queryKey: unknown[] }) => q.queryKey[0]);

beforeEach(() => {
  h.store.clear();
  visibility = 'visible';
});

describe('the cache on the device', () => {
  it('is never saved over before it was restored, then is saved at once as the page goes', () => {
    queryClient.setQueryData(['conversation', 'c1'], { title: 'Now' });
    // Still loading what was saved: leaving writes nothing over it.
    saveCacheNow('4');
    expect(saved()).toBeNull();
    saveCacheWhenLeft('4');
    fire('window:pagehide');
    expect(saved().buster).toBe('4');
    expect(keys()).toEqual(['conversation']);
  });

  it('is saved when the tab is hidden, as it last was, and never with what it leaves out', () => {
    queryClient.setQueryData(['conversation', 'c1'], { title: 'Later' });
    queryClient.setQueryData(['search', 'x'], { hits: [] });
    fire('document:visibilitychange');
    expect(saved()).toBeNull();
    visibility = 'hidden';
    fire('document:visibilitychange');
    const conversation = saved().clientState.queries.find(
      (q: { queryKey: unknown[] }) => q.queryKey[0] === 'conversation',
    );
    expect(conversation.state.data).toEqual({ title: 'Later' });
    expect(keys()).not.toContain('search');
  });
});

describe('the cache on a phone', () => {
  it('is saved at once as the app goes to the background', async () => {
    vi.resetModules();
    const changed: Array<(s: string) => void> = [];
    vi.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
      AppState: {
        addEventListener: (_: string, fn: (s: string) => void) => {
          changed.push(fn);
          return { remove() {} };
        },
      },
    }));
    const phone = await import('./queryClient');
    phone.queryClient.setQueryData(['conversation', 'c2'], { title: 'On the phone' });
    phone.saveCacheWhenLeft('4');
    for (const fn of changed) fn('active');
    expect(saved()).toBeNull();
    for (const fn of changed) fn('background');
    expect(keys()).toEqual(['conversation']);
  });
});
