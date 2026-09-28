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
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
vi.mock('@/api/client', () => ({ getAuthToken: () => null, wrongAccount: h.wrongAccount }));
vi.mock('@/api/endpoints', () => ({ endpoints: {} }));
vi.mock('@/api/keys', () => ({ qk: { inbox: ['inbox'], notifications: ['notifications'] } }));
vi.mock('@/api/queryClient', () => ({
  queryClient: {
    getQueryCache: () => ({ findAll: () => [], subscribe: () => () => {} }),
    invalidateQueries: async () => {},
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
  h.wrongAccount.mockClear();
  h.applyEvent.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

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
});
