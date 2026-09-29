/**
 * The web call engine against fake WebRTC, media and endpoints: what the heartbeat, answering,
 * a ring's end and closing the tab do when events are lost, late or out of order. (The E2E
 * covers a real call; these cover what a real network does to one.)
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
    startCall: vi.fn(),
    acceptCall: vi.fn(),
    declineCall: vi.fn(async () => ({})),
    endCall: vi.fn(async () => ({})),
    signalCall: vi.fn(async () => ({ ok: true })),
    callAlive: vi.fn(),
    callIce: vi.fn(async () => ({ iceServers: [] as unknown[], relay: false })),
    liveCall: vi.fn(async () => ({ call: null as unknown })),
  };
  // A signed-in account that can sign out, as the session store does.
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
  // The group engine's own look for what rings now.
  const checkLiveGroupCall = vi.fn(async () => {});
  return {
    ApiError,
    endpoints,
    useSession,
    signOut,
    signIn,
    checkLiveGroupCall,
    toasts: [] as string[],
  };
});
vi.mock('@/api/client', () => ({ ApiError: h.ApiError }));
vi.mock('@/api/endpoints', () => ({ endpoints: h.endpoints }));
vi.mock('@/lib/config', () => ({ API_URL: 'https://api.example' }));
vi.mock('@/state/session', () => ({ useSession: h.useSession }));
vi.mock('@/ui/Toast', () => ({ toast: (m: string) => h.toasts.push(m) }));
vi.mock('./group', () => ({ checkLiveGroupCall: h.checkLiveGroupCall }));

const stopped: string[] = [];
class FakeTrack {
  enabled = true;
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
  replaced: Array<FakeTrack | null> = [];
  constructor(public track: FakeTrack | null) {}
  async replaceTrack(track: FakeTrack | null) {
    this.replaced.push(track);
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
  constructor(
    public label: string,
    public init: Record<string, unknown>,
  ) {}
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
  localDescription: unknown = null;
  transceivers: FakeTransceiver[] = [];
  channels: FakeChannel[] = [];
  offered = false;
  /** What it said it would send and receive when it answered. */
  answered: Array<{ kind: string; direction: string }> | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: unknown = null;
  onicecandidate: unknown = null;
  constructor() {
    pcs.push(this);
  }
  addTrack(track: FakeTrack) {
    this.transceivers.push(new FakeTransceiver(track.kind, 'sendrecv', track));
  }
  addTransceiver(kind: string, init: { direction: string }) {
    if (this.offered) throw new Error('added after the offer');
    this.transceivers.push(new FakeTransceiver(kind, init.direction, null));
  }
  getTransceivers() {
    return this.transceivers;
  }
  createDataChannel(label: string, init: Record<string, unknown>) {
    const channel = new FakeChannel(label, init);
    this.channels.push(channel);
    return channel;
  }
  /** Of what it sends and receives, in order. */
  media() {
    return this.transceivers.map((t) => ({ kind: t.receiver.track.kind, direction: t.direction }));
  }
  close() {
    this.closed = true;
  }
  async createOffer() {
    this.offered = true;
    return { type: 'offer', sdp: 'v=0' };
  }
  async createAnswer() {
    this.answered = this.media();
    return { type: 'answer', sdp: 'v=0' };
  }
  async setLocalDescription(d: unknown) {
    this.localDescription = d;
  }
  async setRemoteDescription(d: { type: string }) {
    // An offer with video meets a device with no camera: it only receives, until told otherwise.
    if (d.type === 'offer' && !this.transceivers.some((t) => t.receiver.track.kind === 'video'))
      this.transceivers.push(new FakeTransceiver('video', 'recvonly', null));
  }
  async addIceCandidate() {}
}

const listeners: Record<string, Array<() => void>> = {};
const fetched: string[] = [];
let media: (constraints: { video: unknown }) => Promise<FakeStream>;
let display: () => Promise<FakeStream>;
let n = 0;

type Engine = typeof import('./engine');
let engine: Engine;
let useCall: typeof import('@/state/calls').useCall;
let DEVICE_ID: string;

const view = (over: Record<string, unknown> = {}) =>
  ({
    id: 'call-1',
    conversationId: 'conv-1',
    kind: 'voice',
    state: 'ringing',
    outcome: null,
    caller: { id: 'them', displayName: 'Noor Haddad', avatarUrl: null },
    callee: { id: 'me', displayName: 'Alex Chen', avatarUrl: null },
    callerDevice: 'dev-caller-00',
    calleeDevice: null,
    createdAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    ...over,
  }) as never;
/** A call this device placed. */
const placed = (over: Record<string, unknown> = {}) =>
  view({
    caller: { id: 'me', displayName: 'Alex Chen', avatarUrl: null },
    callee: { id: 'them', displayName: 'Noor Haddad', avatarUrl: null },
    callerDevice: DEVICE_ID,
    ...over,
  });
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const phase = () => useCall.getState().phase;

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
    vi.fn(async (url: string) => {
      fetched.push(url);
      return { ok: true };
    }),
  );
  engine = await import('./engine');
  ({ useCall, DEVICE_ID } = await import('@/state/calls'));
});
beforeEach(() => {
  vi.useFakeTimers();
  h.signIn();
  useCall.getState().reset();
  stopped.length = 0;
  fetched.length = 0;
  pcs.length = 0;
  h.toasts.length = 0;
  for (const f of Object.values(h.endpoints)) f.mockReset();
  h.checkLiveGroupCall.mockClear();
  h.endpoints.declineCall.mockResolvedValue({});
  h.endpoints.endCall.mockResolvedValue({});
  h.endpoints.signalCall.mockResolvedValue({ ok: true });
  h.endpoints.callIce.mockResolvedValue({ iceServers: [], relay: false });
  h.endpoints.liveCall.mockResolvedValue({ call: null });
  media = async (c) =>
    new FakeStream([
      new FakeTrack('audio', `mic-${++n}`),
      ...(c.video ? [new FakeTrack('video', `cam-${n}`)] : []),
    ]);
  display = async () => new FakeStream([new FakeTrack('video', `screen-${++n}`)]);
});
afterEach(async () => {
  await vi.runOnlyPendingTimersAsync().catch(() => {});
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('the web call engine, when the network misbehaves', () => {
  it('a beat that comes back after the call ended changes nothing: how it ended stays said', async () => {
    h.endpoints.startCall.mockResolvedValue({ call: placed() });
    await engine.startCall('conv-1', 'voice');
    const beat = deferred<unknown>();
    h.endpoints.callAlive.mockReturnValue(beat.promise);
    await vi.advanceTimersByTimeAsync(5000);
    engine.onCallEvent({
      type: 'call.updated',
      data: placed({ state: 'ended', outcome: 'declined' }),
    });
    expect(useCall.getState().note).toBe('Noor Haddad didn’t answer.');
    beat.reject(new h.ApiError(409, 'call_ended', 'That call has ended.'));
    await settle();
    expect(phase()).toBe('ended');
    expect(useCall.getState().note).toBe('Noor Haddad didn’t answer.');
  });

  it('when the event is lost, the beat says how it ended', async () => {
    h.endpoints.startCall.mockResolvedValue({ call: placed() });
    await engine.startCall('conv-1', 'voice');
    h.endpoints.callAlive.mockRejectedValue(
      new h.ApiError(409, 'call_ended', 'That call has ended.', {
        call: placed({ state: 'ended', outcome: 'declined' }),
      }),
    );
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(phase()).toBe('ended');
    expect(useCall.getState().note).toBe('Noor Haddad didn’t answer.');
  });

  it('a beat from before the answer, arriving after it, doesn’t move the call back', async () => {
    h.endpoints.startCall.mockResolvedValue({ call: placed() });
    await engine.startCall('conv-1', 'voice');
    const beat = deferred<{ call: unknown }>();
    h.endpoints.callAlive.mockReturnValue(beat.promise);
    await vi.advanceTimersByTimeAsync(5000);
    const answered = placed({
      state: 'active',
      calleeDevice: 'dev-callee-00',
      answeredAt: new Date().toISOString(),
    });
    engine.onCallEvent({ type: 'call.updated', data: answered });
    await settle();
    beat.resolve({ call: placed() });
    await settle();
    expect(useCall.getState().call?.state).toBe('active');
    expect(useCall.getState().call?.answeredAt).not.toBeNull();
    expect(pcs).toHaveLength(1);
  });

  it('signed out mid-call, the camera and microphone stop at once', async () => {
    h.endpoints.startCall.mockResolvedValue({ call: placed({ kind: 'video' }) });
    await engine.startCall('conv-1', 'video');
    engine.onCallEvent({
      type: 'call.updated',
      data: placed({ kind: 'video', state: 'active', calleeDevice: 'dev-callee-00' }),
    });
    await settle();
    const pc = pcs.at(-1)!;
    // The next beat learns the session is gone; the session store signs the device out.
    h.endpoints.callAlive.mockRejectedValue(new h.ApiError(401, 'unauthorized', 'Sign in.'));
    h.signOut();
    expect(phase()).toBeNull();
    expect(pc.closed).toBe(true);
    expect(stopped.sort()).toEqual([`cam-${n}`, `mic-${n}`].sort());
  });

  it('a 401 beat ends the call here, even before the sign-out lands', async () => {
    h.endpoints.startCall.mockResolvedValue({ call: placed() });
    await engine.startCall('conv-1', 'voice');
    h.endpoints.callAlive.mockRejectedValue(new h.ApiError(401, 'unauthorized', 'Sign in.'));
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(phase()).toBe('ended');
    expect(stopped).toEqual([`mic-${n}`]);
  });

  it('a ring whose end this tab never heard of stops once its time is up', async () => {
    engine.onCallEvent({ type: 'call.ringing', data: view() });
    expect(phase()).toBe('incoming');
    await vi.advanceTimersByTimeAsync(40_000);
    expect(phase()).toBe('incoming');
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(h.endpoints.liveCall).toHaveBeenCalled();
    expect(phase()).toBeNull();
  });

  it('after a gap, a ring answered or called off elsewhere stops; one still ringing goes on', async () => {
    engine.onCallEvent({ type: 'call.ringing', data: view() });
    h.endpoints.liveCall.mockResolvedValue({ call: view() });
    await engine.checkLiveCall();
    expect(phase()).toBe('incoming');
    h.endpoints.liveCall.mockResolvedValue({ call: null });
    await engine.checkLiveCall();
    expect(phase()).toBeNull();
  });

  it('a video call from a device without a camera still receives the other’s camera', async () => {
    media = async (c) => {
      if (c.video) throw new DOMException('No camera', 'NotFoundError');
      return new FakeStream([new FakeTrack('audio', `mic-${++n}`)]);
    };
    h.endpoints.startCall.mockResolvedValue({ call: placed({ kind: 'video' }) });
    await engine.startCall('conv-1', 'video');
    expect(useCall.getState().cameraOff).toBe(true);
    engine.onCallEvent({
      type: 'call.updated',
      data: placed({ kind: 'video', state: 'active', calleeDevice: 'dev-callee-00' }),
    });
    await settle();
    expect(pcs.at(-1)!.media()).toEqual([
      { kind: 'audio', direction: 'sendrecv' },
      { kind: 'video', direction: 'sendrecv' },
    ]);
  });

  it('closing a tab that pressed Answer but isn’t in the call yet turns nothing down', async () => {
    engine.onCallEvent({ type: 'call.ringing', data: view() });
    media = () => new Promise(() => {}); // the browser is asking for the microphone
    void engine.answer();
    await settle();
    expect(phase()).toBe('connecting');
    for (const f of listeners.pagehide ?? []) f();
    expect(fetched).toEqual([]);
  });

  it('closing a tab that is in the call hangs up', async () => {
    h.endpoints.startCall.mockResolvedValue({ call: placed() });
    await engine.startCall('conv-1', 'voice');
    for (const f of listeners.pagehide ?? []) f();
    expect(fetched).toEqual(['https://api.example/v1/calls/call-1/end']);
  });

  it('an answer that lands after the call ended starts nothing that could end the next one', async () => {
    engine.onCallEvent({ type: 'call.ringing', data: view() });
    const accepted = deferred<unknown>();
    h.endpoints.acceptCall.mockReturnValue(accepted.promise);
    const answering = engine.answer();
    await settle();
    engine.onCallEvent({
      type: 'call.updated',
      data: view({ state: 'ended', outcome: 'completed', calleeDevice: DEVICE_ID }),
    });
    accepted.resolve({ call: view({ state: 'active', calleeDevice: DEVICE_ID }) });
    await answering;
    await vi.advanceTimersByTimeAsync(2000);
    expect(phase()).toBeNull();
    // A new call rings and is answered, the microphone prompt still up past 30 seconds.
    engine.onCallEvent({ type: 'call.ringing', data: view({ id: 'call-2' }) });
    media = () => new Promise(() => {});
    void engine.answer();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(h.endpoints.endCall).not.toHaveBeenCalled();
    expect(h.endpoints.declineCall).not.toHaveBeenCalled();
    expect(phase()).toBe('connecting');
  });
  it('Mute or camera off pressed while the browser asks holds for what it gives', async () => {
    engine.onCallEvent({ type: 'call.ringing', data: view({ kind: 'video' }) });
    const asked = deferred<FakeStream>();
    media = () => asked.promise;
    h.endpoints.acceptCall.mockResolvedValue({
      call: view({ kind: 'video', state: 'active', calleeDevice: DEVICE_ID }),
    });
    const answering = engine.answer();
    await settle();
    expect(phase()).toBe('connecting');
    engine.toggleMute();
    engine.toggleCamera();
    const mic = new FakeTrack('audio', 'mic-held');
    const cam = new FakeTrack('video', 'cam-held');
    asked.resolve(new FakeStream([mic, cam]));
    await answering;
    await settle();
    expect([mic.enabled, cam.enabled]).toEqual([false, false]);
    expect(useCall.getState()).toMatchObject({ muted: true, cameraOff: true });
    const channel = (pcs[0] as FakePC).channels[0] as FakeChannel;
    channel.open();
    expect(channel.sent.at(-1)).toEqual({ camera: false, sharing: false, muted: true });
    await engine.hangUp();
    await vi.advanceTimersByTimeAsync(2000);

    // Calling someone, too.
    const calling = deferred<FakeStream>();
    media = () => calling.promise;
    h.endpoints.startCall.mockResolvedValue({ call: placed() });
    const starting = engine.startCall('conv-1', 'voice');
    await settle();
    engine.toggleMute();
    const mine = new FakeTrack('audio', 'mic-start');
    calling.resolve(new FakeStream([mine]));
    await starting;
    expect(phase()).toBe('outgoing');
    expect(mine.enabled).toBe(false);
  });

  it('free again, it looks for a group call that rang meanwhile', async () => {
    engine.onCallEvent({ type: 'call.ringing', data: view() });
    await engine.hangUp();
    expect(h.checkLiveGroupCall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.checkLiveGroupCall).toHaveBeenCalledTimes(1);
    // Answered on another of this person's devices: this one is free at once.
    engine.onCallEvent({ type: 'call.ringing', data: view({ id: 'call-2' }) });
    engine.onCallEvent({
      type: 'call.updated',
      data: view({ id: 'call-2', state: 'active', calleeDevice: 'dev-my-phone' }),
    });
    expect(phase()).toBeNull();
    expect(h.checkLiveGroupCall).toHaveBeenCalledTimes(2);
  });
});

describe('a call that can’t connect', () => {
  async function placedAndFailed(relay: boolean) {
    h.endpoints.callIce.mockResolvedValue({ iceServers: [], relay });
    h.endpoints.startCall.mockResolvedValue({ call: placed() });
    await engine.startCall('conv-1', 'voice');
    engine.onCallEvent({
      type: 'call.updated',
      data: placed({ state: 'active', calleeDevice: 'dev-callee-00' }),
    });
    await settle();
    const pc = pcs.at(-1)!;
    pc.connectionState = 'failed';
    pc.onconnectionstatechange?.();
    await settle();
  }

  it('with no relay to go through, says a network may be blocking it and what to try', async () => {
    await placedAndFailed(false);
    expect(phase()).toBe('ended');
    expect(useCall.getState().note).toBe('The call couldn’t connect.');
    expect(h.toasts).toEqual([
      'One of your networks may be blocking calls. Try again on another, such as Wi-Fi.',
    ]);
    expect(h.endpoints.endCall).toHaveBeenCalledWith('call-1', {
      deviceId: DEVICE_ID,
      failed: true,
    });
  });

  it('through a relay, it only says it couldn’t connect', async () => {
    await placedAndFailed(true);
    expect(useCall.getState().note).toBe('The call couldn’t connect.');
    expect(h.toasts).toEqual([]);
  });

  it('never finding each other in time ends it the same way', async () => {
    h.endpoints.callIce.mockResolvedValue({ iceServers: [], relay: false });
    h.endpoints.startCall.mockResolvedValue({ call: placed() });
    await engine.startCall('conv-1', 'voice');
    engine.onCallEvent({
      type: 'call.updated',
      data: placed({ state: 'active', calleeDevice: 'dev-callee-00' }),
    });
    await settle();
    expect(phase()).toBe('connecting');
    // The server still has it on all the while: only the two devices can't find each other.
    h.endpoints.callAlive.mockResolvedValue({
      call: placed({ state: 'active', calleeDevice: 'dev-callee-00' }),
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(phase()).toBe('ended');
    expect(h.toasts).toHaveLength(1);
  });
});

describe('sharing a screen in a call', () => {
  /** Placed, answered and connected, with the two devices' own line open. */
  async function connected(kind: 'voice' | 'video') {
    h.endpoints.startCall.mockResolvedValue({ call: placed({ kind }) });
    await engine.startCall('conv-1', kind);
    engine.onCallEvent({
      type: 'call.updated',
      data: placed({ kind, state: 'active', calleeDevice: 'dev-callee-00' }),
    });
    await settle();
    const pc = pcs.at(-1)!;
    pc.connectionState = 'connected';
    pc.onconnectionstatechange?.();
    const channel = pc.channels[0]!;
    channel.open();
    return { pc, channel };
  }

  it('a voice call is offered with video both ways and the two devices’ own line', async () => {
    const { pc, channel } = await connected('voice');
    expect(pc.media()).toEqual([
      { kind: 'audio', direction: 'sendrecv' },
      { kind: 'video', direction: 'sendrecv' },
    ]);
    expect(channel.init).toEqual({ negotiated: true, id: 0 });
    // Once open, it says what this device shows.
    expect(channel.sent).toEqual([{ camera: false, sharing: false, muted: false }]);
  });

  it('answering a voice call, video goes both ways too, so either side can share later', async () => {
    engine.onCallEvent({ type: 'call.ringing', data: view() });
    h.endpoints.acceptCall.mockResolvedValue({
      call: view({ state: 'active', calleeDevice: DEVICE_ID }),
    });
    await engine.answer();
    engine.onCallEvent({
      type: 'call.signal',
      data: {
        callId: 'call-1',
        from: 'dev-caller-00',
        to: DEVICE_ID,
        kind: 'offer',
        sdp: 'v=0',
        candidate: null,
      },
    });
    await settle();
    expect(pcs.at(-1)!.answered).toEqual([
      { kind: 'audio', direction: 'sendrecv' },
      { kind: 'video', direction: 'sendrecv' },
    ]);
  });

  it('shares in place of the camera, and the browser’s own stop puts the camera back', async () => {
    const { pc, channel } = await connected('video');
    const camera = useCall.getState().local!.getVideoTracks()[0];
    await engine.startSharing();
    const sender = pc.transceivers.find((t) => t.receiver.track.kind === 'video')!.sender;
    expect(sender.track?.id).toMatch(/^screen-/);
    expect(useCall.getState().sharing).toBe(true);
    expect(channel.sent.at(-1)).toEqual({ camera: true, sharing: true, muted: false });
    // The browser's "Stop sharing" bar.
    const screen = sender.track as unknown as FakeTrack & { onended: (() => void) | null };
    screen.onended?.();
    await settle();
    expect(sender.track).toBe(camera);
    expect(stopped).toContain(screen.id);
    expect(useCall.getState().sharing).toBe(false);
    expect(channel.sent.at(-1)).toEqual({ camera: true, sharing: false, muted: false });
  });

  it('choosing nothing to share changes nothing and says nothing', async () => {
    await connected('video');
    display = async () => {
      throw new DOMException('Cancelled', 'NotAllowedError');
    };
    await engine.startSharing();
    expect(useCall.getState().sharing).toBe(false);
    expect(h.toasts).toEqual([]);
  });

  it('what the other side says it shows is kept for the screen to draw', async () => {
    const { channel } = await connected('video');
    channel.onmessage?.({ data: JSON.stringify({ camera: false, sharing: true, muted: true }) });
    expect(useCall.getState().theirs).toEqual({ camera: false, sharing: true, muted: true });
    // Something it doesn't understand is ignored.
    channel.onmessage?.({ data: 'not json' });
    expect(useCall.getState().theirs).toEqual({ camera: false, sharing: true, muted: true });
  });
});
