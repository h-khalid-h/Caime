/** Notifications in this browser: asking once, subscribing, keeping it, and letting it go. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  endpoints: {
    pushKey: vi.fn(async () => ({ publicKey: 'AQID' })),
    subscribePush: vi.fn(async (_body: unknown) => ({ ok: true })),
    unsubscribePush: vi.fn(async (_endpoint: string) => ({ ok: true })),
  },
}));
vi.mock('@/api/endpoints', () => ({ endpoints: h.endpoints }));

class FakeSub {
  unsubscribed = false;
  constructor(
    public endpoint: string,
    public key: number[],
  ) {}
  get options() {
    return { applicationServerKey: new Uint8Array(this.key).buffer };
  }
  toJSON() {
    return { endpoint: this.endpoint, keys: { p256dh: 'p', auth: 'a' } };
  }
  async unsubscribe() {
    this.unsubscribed = true;
    return true;
  }
}
let permission: string;
let asked: number;
let current: FakeSub | null;
let messages: ((e: { data: unknown }) => void) | null;

beforeEach(() => {
  vi.resetModules();
  permission = 'default';
  asked = 0;
  current = null;
  messages = null;
  for (const f of Object.values(h.endpoints)) f.mockClear();
  const pushManager = {
    getSubscription: async () => current,
    subscribe: async (o: { applicationServerKey: Uint8Array }) => {
      current = new FakeSub(`https://push.example/${Math.random()}`, [...o.applicationServerKey]);
      return current;
    },
  };
  const registration = { pushManager };
  vi.stubGlobal('window', { PushManager: class {}, Notification: {} });
  vi.stubGlobal('Notification', {
    get permission() {
      return permission;
    },
    requestPermission: async () => {
      asked++;
      permission = 'granted';
      return permission;
    },
  });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
      getRegistration: async () => registration,
      addEventListener: (_t: string, f: typeof messages) => {
        messages = f;
      },
      removeEventListener: () => {
        messages = null;
      },
    },
  });
  vi.stubGlobal('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notifications in this browser', () => {
  it('asks only when turned on, then subscribes with the server’s key and says so', async () => {
    const push = await import('./webPush.web');
    await push.resumeWebPush();
    expect(asked).toBe(0);
    expect(h.endpoints.subscribePush).not.toHaveBeenCalled();
    expect(await push.enableWebPush()).toBe('granted');
    expect(asked).toBe(1);
    expect(current?.key).toEqual([1, 2, 3]);
    expect(h.endpoints.subscribePush).toHaveBeenCalledWith({
      kind: 'webpush',
      subscription: { endpoint: current?.endpoint, keys: { p256dh: 'p', auth: 'a' } },
    });
    expect(await push.webPushOn()).toBe(true);
  });

  it('signed in again where they said yes, the same subscription goes to this session; a new key replaces it', async () => {
    permission = 'granted';
    current = new FakeSub('https://push.example/old', [1, 2, 3]);
    const push = await import('./webPush.web');
    await push.resumeWebPush();
    expect(asked).toBe(0);
    expect(h.endpoints.subscribePush.mock.calls[0]?.[0]).toMatchObject({
      subscription: { endpoint: 'https://push.example/old' },
    });
    const old = current;
    h.endpoints.pushKey.mockResolvedValueOnce({ publicKey: 'BAUG' });
    await push.resumeWebPush();
    expect(old?.unsubscribed).toBe(true);
    expect(current?.key).toEqual([4, 5, 6]);
  });

  it('turned off, the server and the browser both forget it', async () => {
    permission = 'granted';
    current = new FakeSub('https://push.example/mine', [1, 2, 3]);
    const push = await import('./webPush.web');
    await push.disableWebPush();
    expect(h.endpoints.unsubscribePush).toHaveBeenCalledWith('https://push.example/mine');
    expect(current?.unsubscribed).toBe(true);
  });

  it('a tapped notification moves the app only to a path of its own', async () => {
    const push = await import('./webPush.web');
    const went: string[] = [];
    push.onOpenFromNotification((p) => went.push(p));
    messages?.({ data: { type: 'caishy.open', path: '/c/1' } });
    messages?.({ data: { type: 'caishy.open', path: 'https://evil.example/' } });
    messages?.({ data: { type: 'other', path: '/x' } });
    expect(went).toEqual(['/c/1']);
  });
});
