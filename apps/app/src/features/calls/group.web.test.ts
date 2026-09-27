/**
 * The web group call engine against fake WebRTC, media and endpoints: who offers to whom, what a
 * device joining or leaving does to the connections, what a late view, a lost event, a device
 * moved or taken out, a failed connection and closing the tab do. (The E2E covers a real call
 * between three browsers; these cover what a real network does to one.)
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public details?: Record<string, unknown>,
    ) {
      super(message);
    }
  }
  const endpoints = {
    startGroupCall: vi.fn(),
    joinGroupCall: vi.fn(),
    declineGroupCall: vi.fn(async () => ({})),
    leaveGroupCall: vi.fn(async () => ({ call: null as unknown })),
    signalGroupCall: vi.fn(async (_id: string, _body: unknown) => ({ ok: true })),
    groupCallAlive: vi.fn(),
    groupCallIn: vi.fn(async () => ({ call: null as unknown })),
    liveGroupCall: vi.fn(async () => ({ call: null as unknown })),
    callIce: vi.fn(async () => ({ iceServers: [] })),
  };
  let user: { id: string } | null = { id: 'me' };
  const subscribers: Array<(s: { user: unknown }, before: { user: unknown }) => void> = [];
  const useSession = {
    getState: () => ({ user }),
    subscribe: (f: (typeof subscribers)[number]) => {
      subscribers.push(f);
      return () => {};
    },
  };
  const signOut = () => {
    const before = { user };
    user = null;
    for (const f of subscribers) f({ user }, before);
  };
  const signIn = () => {
    user = { id: 'me' };
  };
  return { ApiError, endpoints, useSession, signOut, signIn, toasts: [] as string[] };
});
vi.mock('@/api/client', () => ({ ApiError: h.ApiError }));
vi.mock('@/api/endpoints', () => ({ endpoints: h.endpoints }));
vi.mock('@/lib/config', () => ({ API_URL: 'https://api.example' }));
vi.mock('@/state/session', () => ({ useSession: h.useSession }));
vi.mock('@/ui/Toast', () => ({ toast: (m: string) => h.toasts.push(m) }));

const stopped: string[] = [];
class FakeTrack {
  enabled = true;
  onended: (() => void) | null = null;
  constructor(
    public kind: string,
    public id: string,
  ) {}
  stop() {
    stopped.push(this.id);
  }
}
class FakeStream {
  constructor(public tracks: FakeTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  addTrack(t: FakeTrack) {
    this.tracks.push(t);
  }
}
class FakeSender {
  constructor(public track: FakeTrack | null) {}
  async replaceTrack(track: FakeTrack | null) {
    this.track = track;
  }
}
class FakeTransceiver {
  sender: FakeSender;
  receiver: { track: { kind: string } };
  constructor(
    kind: string,
    public direction: string,
    track: FakeTrack | null,
  ) {
    this.sender = new FakeSender(track);
    this.receiver = { track: { kind } };
  }
}
class FakeChannel {
  readyState = 'connecting';
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  send(m: string) {
    this.sent.push(JSON.parse(m));
  }
  close() {
    this.readyState = 'closed';
  }
  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
}
const pcs: FakePC[] = [];
class FakePC {
  closed = false;
  connectionState = 'new';
  signalingState = 'stable';
  transceivers: FakeTransceiver[] = [];
  channel: FakeChannel | null = null;
  offers: Array<{ iceRestart?: boolean } | undefined> = [];
  localDescription: { type: string; sdp: string } | null = null;
  remote: string[] = [];
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((e: { track: FakeTrack }) => void) | null = null;
  onicecandidate: unknown = null;
  constructor() {
    pcs.push(this);
  }
  addTrack(track: FakeTrack) {
    this.transceivers.push(new FakeTransceiver(track.kind, 'sendrecv', track));
  }
  addTransceiver(kind: string, init: { direction: string }) {
    this.transceivers.push(new FakeTransceiver(kind, init.direction, null));
  }
  getTransceivers() {
    return this.transceivers;
  }
  createDataChannel() {
    this.channel = new FakeChannel();
    return this.channel;
  }
  close() {
    this.closed = true;
  }
  async createOffer(options?: { iceRestart?: boolean }) {
    this.offers.push(options);
    return { type: 'offer', sdp: `offer-${this.offers.length}` };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'answer' };
  }
  async setLocalDescription(d: { type: string; sdp: string }) {
    this.localDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remote.push(d.type);
    if (d.type === 'offer' && !this.transceivers.some((t) => t.receiver.track.kind === 'video'))
      this.transceivers.push(new FakeTransceiver('video', 'recvonly', null));
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate() {}
  /** The connection comes up, drops or fails. */
  become(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

const listeners: Record<string, Array<() => void>> = {};
const fetched: Array<{ url: string; body: string }> = [];
let media: (constraints: { video: unknown }) => Promise<FakeStream>;
let display: () => Promise<FakeStream>;
let n = 0;

type Engine = typeof import('./group.web');
let engine: Engine;
let useGroupCall: typeof import('@/state/groupCall').useGroupCall;
let useCall: typeof import('@/state/calls').useCall;
let DEVICE_ID: string;

const at = (s: number) => new Date(Date.UTC(2026, 8, 26, 12, 0, s)).toISOString();
type Member = {
  id: string;
  name?: string;
  state?: string;
  device?: string | null;
  joinedAt?: string | null;
};
/** Each case's call has its own id, as every real call does (an ended one is never back). */
let seq = 0;
let callId = 'gc-0';
/** A group call, as the server says it stands; `me` is this person, on this device if joined. */
const view = (members: Member[], over: Record<string, unknown> = {}) =>
  ({
    id: callId,
    conversationId: 'conv-g',
    conversationTitle: 'Trip',
    kind: 'voice',
    state: 'active',
    rev: 1,
    outcome: null,
    startedBy: { id: 'noor', displayName: 'Noor Haddad', avatarUrl: null },
    members: members.map((m) => ({
      person: { id: m.id, displayName: m.name ?? m.id, avatarUrl: null },
      state: m.state ?? 'joined',
      device: (m.state ?? 'joined') === 'joined' ? (m.device ?? `dev-${m.id}-0000`) : null,
      joinedAt: m.joinedAt ?? null,
    })),
    createdAt: new Date().toISOString(),
    answeredAt: new Date().toISOString(),
    endedAt: null,
    ...over,
  }) as never;
const meIn = (joinedAt = at(30)): Member => ({ id: 'me', device: DEVICE_ID, joinedAt });
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const phase = () => useGroupCall.getState().phase;
const sent = () =>
  h.endpoints.signalGroupCall.mock.calls.map(
    (c) => [(c[1] as { to: string }).to, (c[1] as { kind: string }).kind] as const,
  );
/** Put this device in a call with these others already in it. */
async function inCall(others: Member[], over: Record<string, unknown> = {}) {
  h.endpoints.joinGroupCall.mockResolvedValue({ call: view([...others, meIn()], over) });
  await engine.joinGroupCall(view(others, over));
  await settle();
}

beforeAll(async () => {
  vi.stubGlobal('window', {
    addEventListener: (type: string, f: () => void) => {
      listeners[type] ??= [];
      listeners[type].push(f);
    },
    RTCPeerConnection: FakePC,
  });
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: (c: { video: unknown }) => media(c),
      getDisplayMedia: () => display(),
    },
  });
  vi.stubGlobal('RTCPeerConnection', FakePC);
  vi.stubGlobal('MediaStream', FakeStream);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      fetched.push({ url, body: init.body });
      return { ok: true };
    }),
  );
  engine = await import('./group.web');
  ({ useGroupCall } = await import('@/state/groupCall'));
  ({ useCall, DEVICE_ID } = await import('@/state/calls'));
});
beforeEach(() => {
  callId = `gc-${++seq}`;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 8, 26, 12, 0, 40)));
  h.signIn();
  useGroupCall.getState().reset();
  useGroupCall.setState({ on: {} });
  useCall.getState().reset();
  stopped.length = 0;
  fetched.length = 0;
  pcs.length = 0;
  h.toasts.length = 0;
  for (const f of Object.values(h.endpoints)) f.mockReset();
  h.endpoints.declineGroupCall.mockResolvedValue({});
  h.endpoints.leaveGroupCall.mockResolvedValue({ call: null });
  h.endpoints.signalGroupCall.mockResolvedValue({ ok: true });
  h.endpoints.callIce.mockResolvedValue({ iceServers: [] });
  h.endpoints.liveGroupCall.mockResolvedValue({ call: null });
  h.endpoints.groupCallIn.mockResolvedValue({ call: null });
  media = async (c) =>
    new FakeStream([
      new FakeTrack('audio', `mic-${++n}`),
      ...(c.video ? [new FakeTrack('video', `cam-${n}`)] : []),
    ]);
  display = async () => new FakeStream([new FakeTrack('video', `screen-${++n}`)]);
});
afterEach(async () => {
  // Whatever call a case left on is let go of before the next.
  if (phase()) await engine.leaveGroupCall();
  await vi.runOnlyPendingTimersAsync().catch(() => {});
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('the web group call engine', () => {
  it('whoever joins offers to everyone already in it, and to nobody else', async () => {
    await inCall([
      { id: 'noor', joinedAt: at(0) },
      { id: 'sam', joinedAt: at(10) },
      { id: 'omar', state: 'ringing' },
    ]);
    expect(phase()).toBe('in');
    expect(pcs).toHaveLength(2);
    expect(sent().sort()).toEqual([
      ['dev-noor-0000', 'offer'],
      ['dev-sam-0000', 'offer'],
    ]);
    // Video goes both ways even in a voice call, so a screen can be shown later.
    for (const pc of pcs)
      expect(pc.transceivers.map((t) => [t.receiver.track.kind, t.direction])).toEqual([
        ['audio', 'sendrecv'],
        ['video', 'sendrecv'],
      ]);
    expect(Object.keys(useGroupCall.getState().peers).sort()).toEqual([
      'dev-noor-0000',
      'dev-sam-0000',
    ]);
  });

  it('someone joining later offers to this device: it waits, then answers them', async () => {
    await inCall([{ id: 'noor', joinedAt: at(0) }]);
    h.endpoints.signalGroupCall.mockClear();
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view([{ id: 'noor', joinedAt: at(0) }, meIn(), { id: 'lina', joinedAt: at(35) }], {
        rev: 2,
      }),
    });
    await settle();
    const lina = pcs.at(-1) as FakePC;
    expect(pcs).toHaveLength(2);
    expect(lina.offers).toHaveLength(0);
    engine.onGroupCallEvent({
      type: 'groupcall.signal',
      data: {
        callId,
        from: 'dev-lina-0000',
        to: DEVICE_ID,
        kind: 'offer',
        sdp: 'v=0',
        candidate: null,
      },
    });
    await settle();
    expect(lina.remote).toEqual(['offer']);
    expect(sent()).toEqual([['dev-lina-0000', 'answer']]);
  });

  it('two devices that joined at the same moment: exactly one of them offers', async () => {
    const low = 'dev-aaaa-0000';
    const high = 'dev-zzzz-0000';
    await inCall([
      { id: 'a', device: low, joinedAt: at(30) },
      { id: 'z', device: high, joinedAt: at(30) },
    ]);
    // This device offers only to the one whose id is lower than its own.
    const offeredTo = sent().map(([to]) => to);
    expect(offeredTo).toEqual(
      [DEVICE_ID > low ? low : null, DEVICE_ID > high ? high : null].filter(Boolean),
    );
  });

  it('a device that leaves is let go of; one moved to another device is reconnected there', async () => {
    await inCall([
      { id: 'noor', joinedAt: at(0) },
      { id: 'sam', joinedAt: at(10) },
    ]);
    const [noorPc, samPc] = pcs as [FakePC, FakePC];
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view(
        [
          { id: 'noor', joinedAt: at(0) },
          { id: 'sam', device: 'dev-sam-laptop', joinedAt: at(38) },
          meIn(),
        ],
        { rev: 2 },
      ),
    });
    await settle();
    expect(noorPc.closed).toBe(false);
    expect(samPc.closed).toBe(true);
    expect(Object.keys(useGroupCall.getState().peers).sort()).toEqual([
      'dev-noor-0000',
      'dev-sam-laptop',
    ]);
    // Sam joined again later than this device: he offers.
    expect((pcs.at(-1) as FakePC).offers).toHaveLength(0);
  });

  it('a device that joins again gets a new connection, even if this one missed it leaving', async () => {
    await inCall([{ id: 'noor', joinedAt: at(0) }]);
    const first = pcs[0] as FakePC;
    // Noor left and joined again on the same tab; this device heard neither, only her offer.
    const offer = (sdp: string) =>
      engine.onGroupCallEvent({
        type: 'groupcall.signal',
        data: { callId, from: 'dev-noor-0000', to: DEVICE_ID, kind: 'offer', sdp, candidate: null },
      });
    offer('v=0\r\na=fingerprint:sha-256 AA:BB\r\n');
    await settle();
    expect(first.closed).toBe(true);
    const second = pcs.at(-1) as FakePC;
    expect(second).not.toBe(first);
    expect(second.remote).toEqual(['offer']);
    expect(sent().at(-1)).toEqual(['dev-noor-0000', 'answer']);
    // Her view comes: it's the connection just made, so it stays.
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view([{ id: 'noor', joinedAt: at(41) }, meIn()], { rev: 3 }),
    });
    await settle();
    expect(second.closed).toBe(false);
    // The same connection trying new routes (an ICE restart) keeps it; a new one replaces it.
    offer('v=0\r\na=fingerprint:sha-256 AA:BB\r\na=ice-restart\r\n');
    await settle();
    expect(second.closed).toBe(false);
    expect(second.remote).toEqual(['offer', 'offer']);
    offer('v=0\r\na=fingerprint:sha-256 CC:DD\r\n');
    await settle();
    expect(second.closed).toBe(true);
    expect((pcs.at(-1) as FakePC).remote).toEqual(['offer']);
    // And a view saying she joined again since (its time is new) is a new connection too.
    const third = pcs.at(-1) as FakePC;
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view([{ id: 'noor', joinedAt: at(42) }, meIn()], { rev: 4 }),
    });
    await settle();
    expect(third.closed).toBe(false);
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view([{ id: 'noor', joinedAt: at(50) }, meIn()], { rev: 5 }),
    });
    await settle();
    expect(third.closed).toBe(true);
    expect(pcs.at(-1)).not.toBe(third);
  });

  it('a view older than the one held changes nothing', async () => {
    await inCall([{ id: 'noor', joinedAt: at(0) }], { rev: 3 });
    let resolveBeat!: (v: unknown) => void;
    const beat = {
      promise: new Promise((r) => (resolveBeat = r)),
      resolve: (v: unknown) => resolveBeat(v),
    };
    h.endpoints.groupCallAlive.mockReturnValue(beat.promise);
    await vi.advanceTimersByTimeAsync(10_000);
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view([{ id: 'noor', joinedAt: at(0) }, meIn(), { id: 'sam', joinedAt: at(39) }], {
        rev: 4,
      }),
    });
    await settle();
    expect(pcs).toHaveLength(2);
    // The beat's answer was worked out before Sam joined.
    beat.resolve({ call: view([{ id: 'noor', joinedAt: at(0) }, meIn()], { rev: 3 }) });
    await settle();
    expect(pcs.every((pc) => !pc.closed)).toBe(true);
    expect(Object.keys(useGroupCall.getState().peers)).toHaveLength(2);
  });

  it('a signal from a device it hasn’t heard of waits for it, and asks the server', async () => {
    await inCall([{ id: 'noor', joinedAt: at(0) }]);
    const later = view([{ id: 'noor', joinedAt: at(0) }, meIn(), { id: 'kai', joinedAt: at(39) }], {
      rev: 2,
    });
    h.endpoints.groupCallAlive.mockResolvedValue({ call: later });
    h.endpoints.signalGroupCall.mockClear();
    engine.onGroupCallEvent({
      type: 'groupcall.signal',
      data: {
        callId,
        from: 'dev-kai-0000',
        to: DEVICE_ID,
        kind: 'offer',
        sdp: 'v=0',
        candidate: null,
      },
    });
    await settle();
    expect(h.endpoints.groupCallAlive).toHaveBeenCalledWith(callId, DEVICE_ID);
    const kai = pcs.at(-1) as FakePC;
    expect(kai.remote).toEqual(['offer']);
    expect(sent()).toEqual([['dev-kai-0000', 'answer']]);
    // Not for this device, or for another call: nothing.
    engine.onGroupCallEvent({
      type: 'groupcall.signal',
      data: {
        callId: `${callId}-other`,
        from: 'dev-kai-0000',
        to: DEVICE_ID,
        kind: 'offer',
        sdp: 'x',
        candidate: null,
      },
    });
    await settle();
    expect(kai.remote).toEqual(['offer']);
  });

  it('moved to another device, or taken out: this one leaves it, quietly', async () => {
    await inCall([{ id: 'noor', joinedAt: at(0) }]);
    const pc = pcs[0] as FakePC;
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view(
        [
          { id: 'noor', joinedAt: at(0) },
          { id: 'me', device: 'dev-my-phone', joinedAt: at(39) },
        ],
        { rev: 2 },
      ),
    });
    expect(phase()).toBe('ended');
    expect(useGroupCall.getState().note).toBe('You’re in this call on another device now.');
    expect(pc.closed).toBe(true);
    expect(stopped).toEqual([`mic-${n}`]);
    expect(h.endpoints.leaveGroupCall).not.toHaveBeenCalled();
  });

  it('the heartbeat hears it ended, or that this device isn’t in it, when the event was lost', async () => {
    await inCall([{ id: 'noor', joinedAt: at(0) }]);
    h.endpoints.groupCallAlive.mockRejectedValue(
      new h.ApiError(409, 'call_ended', 'That call has ended.', {
        call: view(
          [
            { id: 'noor', state: 'left' },
            { id: 'me', state: 'left' },
          ],
          {
            state: 'ended',
            outcome: 'completed',
            rev: 5,
          },
        ),
      }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(phase()).toBe('ended');
    expect(pcs[0]?.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    callId = `gc-${++seq}`;
    await inCall([{ id: 'noor', joinedAt: at(0) }]);
    // Joined again on another device, and the event lost: the beat says so.
    h.endpoints.groupCallAlive.mockRejectedValue(
      new h.ApiError(403, 'not_in_call', 'This device isn’t in that call.', {
        call: view(
          [
            { id: 'noor', joinedAt: at(0) },
            { id: 'me', device: 'dev-my-phone', joinedAt: at(45) },
          ],
          { rev: 6 },
        ),
      }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(phase()).toBe('ended');
    expect(useGroupCall.getState().note).toBe('You’re in this call on another device now.');
    // Offline for a moment, the next beat tries again.
    await vi.advanceTimersByTimeAsync(2000);
    callId = `gc-${++seq}`;
    await inCall([{ id: 'noor', joinedAt: at(0) }]);
    h.endpoints.groupCallAlive.mockRejectedValue(new TypeError('Failed to fetch'));
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(phase()).toBe('in');
  });

  it('a connection that fails is offered again, with new routes, by whoever offered', async () => {
    await inCall([{ id: 'noor', joinedAt: at(0) }]);
    const pc = pcs[0] as FakePC;
    expect(pc.offers).toEqual([undefined]);
    pc.become('failed');
    await settle();
    expect(pc.offers).toEqual([undefined, { iceRestart: true }]);
    expect(useGroupCall.getState().peers['dev-noor-0000']?.link).toBe('reconnecting');
    pc.become('connected');
    expect(useGroupCall.getState().peers['dev-noor-0000']?.link).toBe('connected');
    // A lasting drop is tried again too; after three tries, the tile says it couldn't.
    for (let i = 0; i < 3; i++) {
      pc.become('failed');
      await settle();
    }
    pc.become('failed');
    await settle();
    expect(useGroupCall.getState().peers['dev-noor-0000']?.link).toBe('failed');
    expect(pc.offers).toHaveLength(5);
  });

  it('a screen shown goes to everyone in it, and back to the camera after', async () => {
    await inCall(
      [
        { id: 'noor', joinedAt: at(0) },
        { id: 'sam', joinedAt: at(10) },
      ],
      { kind: 'video' },
    );
    const camera = `cam-${n}`;
    await engine.startGroupSharing();
    const screen = `screen-${n}`;
    const shown = () =>
      pcs.map(
        (pc) => pc.transceivers.find((t) => t.receiver.track.kind === 'video')?.sender.track?.id,
      );
    expect(shown()).toEqual([screen, screen]);
    expect(useGroupCall.getState().sharing).toBe(true);
    // Someone joining meanwhile is shown the screen from the start.
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view(
        [
          { id: 'noor', joinedAt: at(0) },
          { id: 'sam', joinedAt: at(10) },
          meIn(),
          { id: 'lina', joinedAt: at(39) },
        ],
        { kind: 'video', rev: 2 },
      ),
    });
    await settle();
    expect(shown()).toEqual([screen, screen, screen]);
    await engine.stopGroupSharing();
    expect(shown()).toEqual([camera, camera, camera]);
    expect(stopped).toContain(screen);
    // Each device hears what this one shows, once its channel opens.
    const channel = pcs[0]?.channel as FakeChannel;
    channel.open();
    expect(channel.sent.at(-1)).toEqual({ camera: true, sharing: false, muted: false });
    engine.toggleGroupMute();
    expect(channel.sent.at(-1)).toEqual({ camera: true, sharing: false, muted: true });
  });

  it('closing the tab leaves the call; one only ringing leaves nothing', async () => {
    engine.onGroupCallEvent({
      type: 'groupcall.ringing',
      data: view(
        [
          { id: 'noor', joinedAt: at(0) },
          { id: 'me', state: 'ringing' },
        ],
        {
          state: 'ringing',
        },
      ),
    });
    expect(phase()).toBe('incoming');
    for (const f of listeners.pagehide ?? []) f();
    expect(fetched).toEqual([]);
    h.endpoints.joinGroupCall.mockResolvedValue({
      call: view([{ id: 'noor', joinedAt: at(0) }, meIn()]),
    });
    await engine.joinGroupCall();
    await settle();
    for (const f of listeners.pagehide ?? []) f();
    expect(fetched.map((f) => f.url)).toEqual([
      `https://api.example/v1/group-calls/${callId}/leave`,
    ]);
  });

  it('a ring stops once it’s joined elsewhere, turned down, or its time is up', async () => {
    const ringing = (over: Record<string, unknown> = {}) =>
      view(
        [
          { id: 'noor', joinedAt: at(0) },
          { id: 'me', state: 'ringing' },
        ],
        {
          state: 'ringing',
          ...over,
        },
      );
    engine.onGroupCallEvent({ type: 'groupcall.ringing', data: ringing() });
    expect(phase()).toBe('incoming');
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view(
        [
          { id: 'noor', joinedAt: at(0) },
          { id: 'me', device: 'dev-my-phone' },
        ],
        {
          rev: 2,
        },
      ),
    });
    expect(phase()).toBeNull();

    engine.onGroupCallEvent({ type: 'groupcall.ringing', data: ringing({ id: `${callId}-next` }) });
    expect(phase()).toBe('incoming');
    await vi.advanceTimersByTimeAsync(49_000);
    await settle();
    expect(h.endpoints.liveGroupCall).toHaveBeenCalled();
    expect(phase()).toBeNull();
  });

  it('nothing rings over a 1:1 call on this device', async () => {
    useCall.getState().patch({ phase: 'active' });
    engine.onGroupCallEvent({
      type: 'groupcall.ringing',
      data: view(
        [
          { id: 'noor', joinedAt: at(0) },
          { id: 'me', state: 'ringing' },
        ],
        {
          state: 'ringing',
        },
      ),
    });
    expect(phase()).toBeNull();
    // It's still on in the group, for its banner.
    expect(useGroupCall.getState().on['conv-g']?.id).toBe(callId);
  });

  it('signed out mid-call, the microphone stops and every connection closes', async () => {
    await inCall([
      { id: 'noor', joinedAt: at(0) },
      { id: 'sam', joinedAt: at(10) },
    ]);
    h.signOut();
    expect(phase()).toBeNull();
    expect(pcs.every((pc) => pc.closed)).toBe(true);
    expect(stopped).toEqual([`mic-${n}`]);
    expect(useGroupCall.getState().on).toEqual({});
  });

  it('the banner goes once the call ends, for someone who just left it too', async () => {
    await inCall([
      { id: 'noor', joinedAt: at(0) },
      { id: 'sam', joinedAt: at(10) },
    ]);
    h.endpoints.leaveGroupCall.mockResolvedValue({
      call: view(
        [
          { id: 'noor', joinedAt: at(0) },
          { id: 'sam', joinedAt: at(10) },
          { id: 'me', state: 'left' },
        ],
        { rev: 2 },
      ),
    });
    await engine.leaveGroupCall();
    await settle();
    expect(phase()).toBe('ended');
    expect(useGroupCall.getState().on['conv-g']?.id).toBe(callId);
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view(
        [
          { id: 'noor', state: 'left' },
          { id: 'sam', state: 'left' },
        ],
        {
          state: 'ended',
          rev: 3,
        },
      ),
    });
    expect(useGroupCall.getState().on['conv-g']).toBeUndefined();
  });

  it('an ended call’s older news never brings its banner back', () => {
    const on = view([{ id: 'noor', joinedAt: at(0) }], { rev: 4 });
    engine.onGroupCallEvent({ type: 'groupcall.updated', data: on });
    expect(useGroupCall.getState().on['conv-g']?.id).toBe(callId);
    engine.onGroupCallEvent({
      type: 'groupcall.updated',
      data: view([{ id: 'noor', state: 'left' }], { state: 'ended', rev: 6 }),
    });
    expect(useGroupCall.getState().on['conv-g']).toBeUndefined();
    engine.onGroupCallEvent({ type: 'groupcall.updated', data: on });
    expect(useGroupCall.getState().on['conv-g']).toBeUndefined();
  });
});
