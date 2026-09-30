/**
 * The realtime socket says who it's signed in as when it opens (its hello). A tab showing one
 * account never shows another's events: when the browser is someone else's by then (another tab
 * signed in as them), the socket closes and the app starts again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  wrongAccount: vi.fn(),
  applyEvent: vi.fn(),
  sockets: [] as FakeSocket[],
  appState: [] as Array<(s: string) => void>,
  callPhase: null as string | null,
  shares: {} as Record<string, unknown>,
  invalidated: [] as unknown[],
}));

class FakeSocket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    h.sockets.push(this);
  }
  send() {}
  close() {
    this.closed = true;
  }
  /** What the server sends. */
  say(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

vi.mock('react-native', () => ({
  Platform: { OS: 'native' },
  AppState: {
    addEventListener: (_: string, fn: (s: string) => void) => {
      h.appState.push(fn);
      return {
        remove() {
          h.appState.splice(h.appState.indexOf(fn), 1);
        },
      };
    },
  },
}));
vi.mock('@/state/calls', () => ({ useCall: { getState: () => ({ phase: h.callPhase }) } }));
vi.mock('@/state/liveShares', () => ({
  useLiveShares: { getState: () => ({ shares: h.shares }) },
}));
vi.mock('@/api/client', () => ({ getAuthToken: () => null, wrongAccount: h.wrongAccount }));
vi.mock('@/api/endpoints', () => ({ endpoints: {} }));
vi.mock('@/api/keys', () => ({ qk: { inbox: ['inbox'], notifications: ['notifications'] } }));
vi.mock('@/api/queryClient', () => ({
  queryClient: {
    getQueryCache: () => ({ findAll: () => [], subscribe: () => () => {} }),
    invalidateQueries: async (q: unknown) => {
      h.invalidated.push(q);
    },
  },
}));
vi.mock('@/features/calls/calls', () => ({
  checkLiveCall: async () => {},
  checkLiveGroupCall: async () => {},
}));
vi.mock('@/lib/config', () => ({ WS_URL: 'ws://caime.example' }));
vi.mock('@/lib/network', () => ({ onNetworkChange: () => () => {} }));
vi.mock('@/state/cache', () => ({ maxSeq: () => 0, upsertMessage: () => {} }));
vi.mock('@/state/live', () => ({
  useLive: { getState: () => ({ setConnection: () => {}, connection: 'open' }) },
}));
vi.mock('@/state/outbox', () => ({ useOutbox: { getState: () => ({ flush: () => {} }) } }));
vi.mock('@/state/taskOutbox', () => ({
  useTaskOutbox: { getState: () => ({ flush: () => {} }) },
}));
vi.mock('./apply', () => ({ applyEvent: h.applyEvent }));

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket);
  h.sockets.length = 0;
  h.appState.length = 0;
  h.invalidated.length = 0;
  h.callPhase = null;
  h.shares = {};
  h.wrongAccount.mockClear();
  h.applyEvent.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const appState = (s: string) => {
  for (const fn of [...h.appState]) fn(s);
};

const { realtime } = await import('./client');
const event = { type: 'event', event: { type: 'message.created', data: {} } };

describe('the realtime socket', () => {
  it('shows what arrives for the account it was opened for', () => {
    realtime.start('u-noor');
    const ws = h.sockets[0];
    ws?.say({ type: 'hello', userId: 'u-noor', serverTime: new Date().toISOString() });
    ws?.say(event);
    expect(h.applyEvent).toHaveBeenCalledTimes(1);
    expect(h.wrongAccount).not.toHaveBeenCalled();
    realtime.stop();
  });

  it('closes, shows nothing, and starts the app again when it finds someone else signed in', () => {
    realtime.start('u-noor');
    const ws = h.sockets[0];
    ws?.say({ type: 'hello', userId: 'u-alex', serverTime: new Date().toISOString() });
    ws?.say(event);
    expect(h.wrongAccount).toHaveBeenCalledTimes(1);
    expect(ws?.closed).toBe(true);
    expect(h.applyEvent).not.toHaveBeenCalled();
  });

  it('rests the socket half a minute after the phone is put away, and comes back caught up', () => {
    vi.useFakeTimers();
    realtime.start('u1');
    const first = h.sockets[0]!;
    first.onopen?.();
    first.say({ type: 'hello', userId: 'u1', serverTime: 'now' });
    appState('background');
    vi.advanceTimersByTime(29_000);
    expect(first.closed).toBe(false);
    vi.advanceTimersByTime(1_500);
    expect(first.closed).toBe(true);
    first.onclose?.();
    // Nothing reconnects on its own while it rests.
    vi.advanceTimersByTime(120_000);
    expect(h.sockets).toHaveLength(1);
    // Back in front: a new socket, and after its hello the lists are refreshed as after a gap.
    h.invalidated.length = 0;
    appState('active');
    expect(h.sockets).toHaveLength(2);
    const second = h.sockets[1]!;
    second.onopen?.();
    second.say({ type: 'hello', userId: 'u1', serverTime: 'now' });
    expect(h.invalidated).toEqual([{ queryKey: ['inbox'] }, { queryKey: ['notifications'] }]);
    realtime.stop();
  });

  it('keeps the socket while a call is on or a location is shared live, and when it comes back first', () => {
    vi.useFakeTimers();
    realtime.start('u1');
    const ws = h.sockets[0]!;
    ws.onopen?.();
    ws.say({ type: 'hello', userId: 'u1', serverTime: 'now' });
    h.callPhase = 'active';
    appState('background');
    vi.advanceTimersByTime(31_000);
    expect(ws.closed).toBe(false);
    h.callPhase = null;
    h.shares = { m1: {} };
    appState('background');
    vi.advanceTimersByTime(31_000);
    expect(ws.closed).toBe(false);
    h.shares = {};
    appState('background');
    vi.advanceTimersByTime(10_000);
    // The server was heard from meanwhile: coming back within the half minute keeps the socket.
    ws.say({ type: 'pong' });
    appState('active');
    vi.advanceTimersByTime(60_000);
    expect(ws.closed).toBe(false);
    expect(h.sockets).toHaveLength(1);
    realtime.stop();
  });
});
