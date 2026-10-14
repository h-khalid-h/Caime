/**
 * Notifications on a phone (push.native.ts), with expo-notifications stood in for: asking once and
 * registering the phone's Expo token, a sign-in that registers without asking, turned off staying
 * off, signing out, clearing what was read, a tap opening where it leads (the cold start's too,
 * once), and Expo Go on Android offering nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Response = {
  notification: { request: { identifier: string; content: { data: unknown } } };
};

const h = vi.hoisted(() => {
  const store = new Map<string, string>();
  const state = {
    os: 'ios',
    expoGo: false,
    status: 'undetermined' as 'undetermined' | 'granted' | 'denied',
    answer: 'granted' as 'granted' | 'denied',
    projectId: 'project-1' as string | undefined,
    presented: [] as Array<{ request: { identifier: string; content: { data: unknown } } }>,
    last: null as Response | null,
    tapped: [] as Array<(r: Response) => void>,
    fronted: [] as Array<(s: string) => void>,
    unread: [] as Array<{ id: string; body: string | null }>,
  };
  const n = {
    AndroidImportance: { HIGH: 4, LOW: 2 },
    getPermissionsAsync: vi.fn(async () => ({ status: state.status })),
    requestPermissionsAsync: vi.fn(async () => {
      state.status = state.answer;
      return { status: state.answer };
    }),
    getExpoPushTokenAsync: vi.fn(async (_: { projectId: string }) => ({
      data: 'ExponentPushToken[phone-1]',
    })),
    setNotificationChannelAsync: vi.fn(async () => null),
    setNotificationHandler: vi.fn(),
    getPresentedNotificationsAsync: vi.fn(async () => state.presented),
    dismissNotificationAsync: vi.fn(async (_: string) => {}),
    addNotificationResponseReceivedListener: vi.fn((fn: (r: Response) => void) => {
      state.tapped.push(fn);
      return { remove: () => state.tapped.splice(state.tapped.indexOf(fn), 1) };
    }),
    getLastNotificationResponseAsync: vi.fn(async () => state.last),
  };
  return {
    store,
    state,
    n,
    endpoints: {
      subscribePush: vi.fn(async (_body: unknown) => ({ ok: true })),
      unsubscribePush: vi.fn(async (_endpoint: string) => ({ ok: true })),
      shownNotifications: vi.fn(async (_ids: string[]) => ({ unread: state.unread })),
    },
  };
});

vi.mock('expo-notifications', () => h.n);
vi.mock('expo', () => ({ isRunningInExpoGo: () => h.state.expoGo }));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { extra: { eas: { projectId: h.state.projectId } } };
    },
    easConfig: null,
  },
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return h.state.os;
    },
  },
  AppState: {
    addEventListener: (_: string, fn: (s: string) => void) => {
      h.state.fronted.push(fn);
      return { remove: () => h.state.fronted.splice(h.state.fronted.indexOf(fn), 1) };
    },
  },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => h.store.get(k) ?? null,
    setItem: async (k: string, v: string) => void h.store.set(k, v),
    removeItem: async (k: string) => void h.store.delete(k),
  },
}));
vi.mock('@/api/endpoints', () => ({ endpoints: h.endpoints }));

/** A fresh module: what it remembers between calls (the handler set, taps followed) starts over. */
const load = async () => {
  vi.resetModules();
  return import('./push.native');
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const tap = (identifier: string, data: unknown): Response => ({
  notification: { request: { identifier, content: { data } } },
});

beforeEach(() => {
  h.store.clear();
  Object.assign(h.state, {
    os: 'ios',
    expoGo: false,
    status: 'undetermined',
    answer: 'granted',
    projectId: 'project-1',
    presented: [],
    last: null,
    tapped: [],
    fronted: [],
    unread: [],
  });
});
afterEach(() => vi.clearAllMocks());

describe('notifications on a phone', () => {
  it('asks once from a button, then registers the Expo token for this session', async () => {
    const push = await load();
    expect(await push.pushOn()).toBe(false);
    expect(await push.enablePush()).toBe('granted');
    expect(h.n.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(h.n.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(h.endpoints.subscribePush).toHaveBeenCalledWith({
      kind: 'expo',
      token: 'ExponentPushToken[phone-1]',
    });
    // While Caime is in front, the phone shows nothing over it.
    const handler = h.n.setNotificationHandler.mock.calls[0]?.[0] as {
      handleNotification: () => Promise<Record<string, boolean>>;
    };
    expect(Object.values(await handler.handleNotification())).toEqual([false, false, false, false]);
    expect(await push.pushOn()).toBe(true);
  });

  it('makes Android its two channels before asking', async () => {
    h.state.os = 'android';
    const push = await load();
    await push.enablePush();
    expect(h.n.setNotificationChannelAsync.mock.calls.map((c) => (c as unknown[])[0])).toContain(
      'messages',
    );
    expect(h.n.setNotificationChannelAsync.mock.calls.map((c) => (c as unknown[])[0])).toContain(
      'quiet',
    );
    expect(h.n.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(
      h.n.requestPermissionsAsync.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('says no and registers nothing when the person says no', async () => {
    h.state.answer = 'denied';
    const push = await load();
    expect(await push.enablePush()).toBe('denied');
    expect(h.endpoints.subscribePush).not.toHaveBeenCalled();
  });

  it('a sign-in registers where they said yes, never asks, and stays off once turned off', async () => {
    const push = await load();
    await push.resumePush();
    expect(h.endpoints.subscribePush).not.toHaveBeenCalled();
    h.state.status = 'granted';
    await push.resumePush();
    expect(h.n.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(h.endpoints.subscribePush).toHaveBeenCalledTimes(1);
    await push.disablePush();
    expect(h.endpoints.unsubscribePush).toHaveBeenCalledWith('ExponentPushToken[phone-1]');
    await push.resumePush();
    expect(h.endpoints.subscribePush).toHaveBeenCalledTimes(1);
    expect(await push.pushOn()).toBe(false);
    // Turned on again here, it's back.
    await push.enablePush();
    expect(h.endpoints.subscribePush).toHaveBeenCalledTimes(2);
  });

  it('without the Expo project it says so rather than registering half', async () => {
    h.state.projectId = undefined;
    const push = await load();
    await expect(push.enablePush()).rejects.toThrow();
    expect(h.endpoints.subscribePush).not.toHaveBeenCalled();
  });

  it('signing out tells the server and clears what this phone shows', async () => {
    h.state.status = 'granted';
    h.state.presented = [
      { request: { identifier: 'a', content: { data: { id: 'n1' } } } },
      { request: { identifier: 'b', content: { data: { id: 'n2' } } } },
    ];
    const push = await load();
    await push.resumePush();
    await push.leaveThisDevice({ tellServer: true });
    expect(h.endpoints.unsubscribePush).toHaveBeenCalledWith('ExponentPushToken[phone-1]');
    expect(h.n.dismissNotificationAsync.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
    // The session was already over: nothing to tell, still cleared.
    vi.clearAllMocks();
    await push.leaveThisDevice({ tellServer: false });
    expect(h.endpoints.unsubscribePush).not.toHaveBeenCalled();
    expect(h.n.dismissNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('what was read elsewhere leaves this phone; the rest stays', async () => {
    h.state.presented = [
      { request: { identifier: 'a', content: { data: { id: 'n1' } } } },
      { request: { identifier: 'b', content: { data: { id: 'n2' } } } },
    ];
    const push = await load();
    await push.closeShownNotifications(['n2']);
    expect(h.n.dismissNotificationAsync.mock.calls.map((c) => c[0])).toEqual(['b']);
  });

  it('coming to the front clears what is over: read, gone, or its words taken back', async () => {
    const shown = (identifier: string, id: string, body: string) => ({
      request: { identifier, content: { data: { id }, body } },
    });
    h.state.presented = [
      shown('a', 'n-kept', 'Are you free?'),
      shown('b', 'n-read', 'See you then'),
      shown('c', 'n-erased', 'The code is 4411'),
      shown('d', 'n-older', 'Lina sent 2 messages'),
    ];
    // Still unread: the first as shown; the third without its words; the fourth says more now.
    h.state.unread = [
      { id: 'n-kept', body: 'Are you free?' },
      { id: 'n-erased', body: null },
      { id: 'n-older', body: 'Lina sent 3 messages' },
    ];
    const push = await load();
    const stop = push.watchShown();
    await flush();
    expect(h.endpoints.shownNotifications).toHaveBeenCalledWith([
      'n-kept',
      'n-read',
      'n-erased',
      'n-older',
    ]);
    expect(h.n.dismissNotificationAsync.mock.calls.map((c) => c[0])).toEqual(['b', 'c', 'd']);
    // Again each time Caime comes to the front; never in the background.
    h.state.fronted[0]?.('background');
    await flush();
    expect(h.endpoints.shownNotifications).toHaveBeenCalledTimes(1);
    h.state.fronted[0]?.('active');
    await flush();
    expect(h.endpoints.shownNotifications).toHaveBeenCalledTimes(2);
    stop();
    expect(h.state.fronted).toEqual([]);
  });

  it('asks nothing when the phone shows nothing of Caime', async () => {
    const push = await load();
    push.watchShown();
    await flush();
    expect(h.endpoints.shownNotifications).not.toHaveBeenCalled();
  });

  it('a tap opens where it leads, the one that started the app once', async () => {
    h.state.last = tap('cold', { conversationId: 'c 1' });
    const push = await load();
    const went: string[] = [];
    const stop = push.onOpenFromNotification((p) => went.push(p));
    await flush();
    expect(went).toEqual(['/c/c%201']);
    // The same tap heard again (a listener that also hears the cold start) is followed once.
    h.state.tapped[0]?.(tap('cold', { conversationId: 'c 1' }));
    h.state.tapped[0]?.(tap('warm', { handle: 'nile.dental' }));
    h.state.tapped[0]?.(tap('none', {}));
    expect(went).toEqual(['/c/c%201', '/o/nile.dental', '/notifications']);
    stop();
    expect(h.state.tapped).toEqual([]);
  });

  it('Expo Go on Android has no pushes: nothing is offered or loaded', async () => {
    h.state.os = 'android';
    h.state.expoGo = true;
    const push = await load();
    const support = await import('./support.native');
    expect(push.pushSupported).toBe(false);
    expect(await push.enablePush()).toBe('unsupported');
    expect(await support.readPushState()).toBe('unsupported');
    expect(await support.promptLater()).toBe(false);
    expect(h.n.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('Chats offers it once, until it is answered', async () => {
    vi.resetModules();
    const support = await import('./support.native');
    expect(support.promptAtStart()).toBe(false);
    expect(await support.promptLater()).toBe(true);
    support.promptAnswered();
    await flush();
    expect(await support.promptLater()).toBe(false);
  });
});
