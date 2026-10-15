/**
 * One WebSocket per device (ARCHITECTURE.md "Realtime protocol"). The web authenticates with its
 * cookie during the upgrade; native sends its token as the first frame. It reconnects with
 * backoff, and after every reconnect it catches up on whatever it missed while away.
 */
import type { RealtimeFrame } from '@caime/core/api';
import type { Query } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { getAuthToken, wrongAccount } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { queryClient } from '@/api/queryClient';
import { checkLiveCalls } from '@/features/calls/calls';
import { WS_URL } from '@/lib/config';
import { onNetworkChange } from '@/lib/network';
import { type MessagePages, maxSeq, upsertMessage } from '@/state/cache';
import { useCall } from '@/state/calls';
import { useLive } from '@/state/live';
import { useLiveShares } from '@/state/liveShares';
import { useOutbox } from '@/state/outbox';
import { useTaskOutbox } from '@/state/taskOutbox';

/**
 * What live events do to the cache (`./apply`), loaded as this module runs, so it's never in the
 * first download (R77's budget) and is here long before the socket's first event.
 */
const applier = import('./apply');

/** Just left a conversation: what was waiting to be sent about it is dropped. */
export function leftConversation(conversationId: string): void {
  void applier.then((m) => m.leftConversation(conversationId));
}

const PING_MS = 25_000;
const STALE_MS = 60_000;
/**
 * A phone put away rests its socket after this long (docs/RESOURCES.md): pushes cover what
 * arrives, and coming back reconnects and catches up. Not during a call or a live location
 * share, which arrive and go through it.
 */
const REST_AFTER_MS = 30_000;
/**
 * A socket that hasn't said hello by now is given up and tried again: a network that accepts
 * the upgrade and then holds it (some Wi-Fi does) would otherwise keep "Connecting…" for good,
 * since nothing else times a socket out before its hello.
 */
const HELLO_MS = 15_000;
/**
 * After this many tries without a hello, what's new is fetched over HTTP while the socket keeps
 * trying (`catchUpMeanwhile`), every `DELAYED_MS` and then at most every `DELAYED_MAX_MS`, and
 * only while the app is in front: the app keeps working on a network that lets no socket through.
 */
const DELAYED_AFTER_TRIES = 3;
const DELAYED_MS = 20_000;
const DELAYED_MAX_MS = 60_000;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private wanted = false;
  private me: string | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private restTimer: ReturnType<typeof setTimeout> | null = null;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  /** The HTTP catch-up while the socket can't connect; null when it isn't running. */
  private meanwhileTimer: ReturnType<typeof setTimeout> | null = null;
  private meanwhileEvery = DELAYED_MS;
  /** The phone is in the background and the socket was let go on purpose: no retries. */
  private resting = false;
  private lastFrameAt = 0;
  private everConnected = false;
  /** The server said hello on the current socket. */
  private ready = false;
  /** As the device last said: offline, a socket that can't open is "offline", not "connecting". */
  private online = true;
  private typingSentAt = new Map<string, number>();
  private unsubscribers: Array<() => void> = [];

  start(userId: string): void {
    if (this.wanted && this.me === userId) return;
    this.stop();
    this.wanted = true;
    this.me = userId;
    this.listen();
    this.connect();
  }

  stop(): void {
    this.wanted = false;
    this.me = null;
    this.everConnected = false;
    this.ready = false;
    this.resting = false;
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
    this.clearTimers();
    this.stopMeanwhile();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'signed out');
    useLive.getState().setConnection('idle');
  }

  /** Tell the others in a conversation I'm typing (at most every 3 s). */
  typing(conversationId: string): void {
    const now = Date.now();
    if (now - (this.typingSentAt.get(conversationId) ?? 0) < 3000) return;
    this.typingSentAt.set(conversationId, now);
    this.send({ type: 'typing', conversationId });
  }

  /** Reconnect immediately (the app came back to the foreground, or the network returned). */
  nudge(): void {
    if (!this.wanted) return;
    this.resting = false;
    if (this.ws && Date.now() - this.lastFrameAt < STALE_MS) {
      // The socket outlived a short network blip. Say it's back, fetch anything the blip may
      // have dropped, and send what queued meanwhile instead of waiting out the outbox's backoff.
      if (this.ready && this.ws.readyState === 1 && useLive.getState().connection === 'offline') {
        useLive.getState().setConnection('open');
        void this.catchUp(true);
      }
      useOutbox.getState().flush();
      useTaskOutbox.getState().flush();
      return;
    }
    this.ws?.close();
    this.ws = null;
    this.attempt = 0;
    this.connect();
  }

  private send(frame: object): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(frame));
  }

  private listen(): void {
    // Whatever it was when last listened to (signed out while offline, say), it's as the
    // browser says now; after this, as it changes.
    this.online = typeof navigator === 'undefined' || navigator.onLine !== false;
    this.unsubscribers.push(
      onNetworkChange((online) => {
        this.online = online;
        if (!online) useLive.getState().setConnection('offline');
        else this.nudge();
      }),
    );
    const sub = AppState.addEventListener('change', (s) => {
      if (this.restTimer) clearTimeout(this.restTimer);
      this.restTimer = null;
      if (s === 'active') this.nudge();
      else if (s === 'background' && Platform.OS !== 'web')
        this.restTimer = setTimeout(() => this.rest(), REST_AFTER_MS);
    });
    this.unsubscribers.push(() => sub.remove());
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') this.nudge();
      };
      document.addEventListener('visibilitychange', onVisible);
      this.unsubscribers.push(() => document.removeEventListener('visibilitychange', onVisible));
    }
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.restTimer) clearTimeout(this.restTimer);
    if (this.helloTimer) clearTimeout(this.helloTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    this.restTimer = null;
    this.helloTimer = null;
  }

  /** What the banner says while there's no socket: offline, catching up over HTTP, or trying. */
  private waiting(): 'offline' | 'delayed' | 'connecting' {
    if (!this.online) return 'offline';
    return this.meanwhileTimer ? 'delayed' : 'connecting';
  }

  private stopMeanwhile(): void {
    if (this.meanwhileTimer) clearTimeout(this.meanwhileTimer);
    this.meanwhileTimer = null;
    this.meanwhileEvery = DELAYED_MS;
  }

  /** Fetch what's new over HTTP every so often while the socket can't connect. */
  private catchUpMeanwhile(): void {
    if (this.meanwhileTimer) return;
    this.meanwhileTimer = setTimeout(() => {
      this.meanwhileTimer = null;
      if (!this.wanted || this.ready || this.resting) return;
      if (this.online && inFront()) void this.catchUp(true);
      this.meanwhileEvery = Math.min(DELAYED_MAX_MS, this.meanwhileEvery * 1.5);
      this.catchUpMeanwhile();
    }, this.meanwhileEvery);
    useLive.getState().setConnection(this.waiting());
  }

  /** Give up on a socket that never said hello, and try again. */
  private giveUp(ws: WebSocket): void {
    if (this.ws !== ws) return;
    ws.onclose = null;
    ws.onmessage = null;
    ws.close();
    this.ws = null;
    this.ready = false;
    this.clearTimers();
    useLive.getState().setConnection(this.waiting());
    this.scheduleRetry();
  }

  /** Let the socket go while the phone is put away, unless a call or a live share needs it. */
  private rest(): void {
    this.restTimer = null;
    if (!this.wanted || this.resting) return;
    const phase = useCall.getState().phase;
    if (phase && phase !== 'ended') return;
    if (Object.keys(useLiveShares.getState().shares).length) return;
    this.resting = true;
    this.clearTimers();
    this.stopMeanwhile();
    const ws = this.ws;
    this.ws = null;
    this.ready = false;
    ws?.close(1000, 'resting');
  }

  private connect(): void {
    if (!this.wanted || this.ws) return;
    this.clearTimers();
    useLive.getState().setConnection(this.waiting());
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_URL}/v1/realtime`);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    this.helloTimer = setTimeout(() => this.giveUp(ws), HELLO_MS);
    ws.onopen = () => {
      this.lastFrameAt = Date.now();
      const token = getAuthToken();
      if (token) ws.send(JSON.stringify({ type: 'auth', token }));
    };
    ws.onmessage = (e) => {
      this.lastFrameAt = Date.now();
      let frame: RealtimeFrame;
      try {
        frame = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (frame.type === 'hello') {
        // Signed in as someone else by now (another tab): nothing of theirs is shown as this
        // person's, and the app starts again as them.
        if (this.me && frame.userId !== this.me) {
          this.stop();
          wrongAccount();
          return;
        }
        this.onHello();
      } else if (frame.type === 'event' && this.me) {
        const me = this.me;
        // Applied in the order received: each waits on the one applier, then runs at once.
        void applier.then((m) => m.applyEvent(queryClient, frame.event, me));
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.ready = false;
      this.clearTimers();
      if (this.wanted && !this.resting) {
        useLive.getState().setConnection(this.waiting());
        this.scheduleRetry();
      }
    };
    ws.onerror = () => {
      // onclose follows and schedules the retry.
    };
  }

  private onHello(): void {
    this.attempt = 0;
    this.ready = true;
    if (this.helloTimer) clearTimeout(this.helloTimer);
    this.helloTimer = null;
    this.stopMeanwhile();
    useLive.getState().setConnection('open');
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastFrameAt > STALE_MS) {
        this.ws?.close();
        return;
      }
      this.send({ type: 'ping' });
    }, PING_MS);
    // Every time, the first too: a message sent after a conversation's first page was read but
    // before this socket was listening arrives through neither.
    void this.catchUp(this.everConnected);
    this.everConnected = true;
    useOutbox.getState().flush();
    useTaskOutbox.getState().flush();
  }

  private scheduleRetry(): void {
    const base = Math.min(30_000, 1000 * 2 ** this.attempt);
    this.attempt += 1;
    if (this.attempt >= DELAYED_AFTER_TRIES) this.catchUpMeanwhile();
    const delay = base / 2 + Math.random() * (base / 2);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  /** Fetch what each open conversation missed; after a gap, refresh the lists too. */
  private async catchUp(afterGap: boolean): Promise<void> {
    // What rings for this person now, the first time too: a call that rang before this socket was
    // listening (the page just opened), or while it was down, arrives through nothing else.
    void checkLiveCalls();
    if (afterGap) {
      void queryClient.invalidateQueries({ queryKey: qk.inbox });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
    }
    const cached = queryClient.getQueryCache().findAll({ queryKey: qk.allMessages });
    const active = cached.filter((q) => q.getObserversCount() > 0);
    for (const q of active) {
      const id = String(q.queryKey[1]);
      // A page on its way was read before now: ask for what came after it once it lands.
      await settled(q);
      if (!q.state.data) continue;
      const after = maxSeq(q.state.data as MessagePages | undefined);
      try {
        const page = await endpoints.messages(id, { after, limit: 200 });
        if (page.messages.length >= 200) {
          void queryClient.resetQueries({ queryKey: qk.messages(id) });
        } else {
          for (const m of page.messages) upsertMessage(queryClient, m);
        }
      } catch {
        // The next reconnect tries again.
      }
    }
  }
}

/** The app is on screen: a page that's visible, a phone's app in front. */
function inFront(): boolean {
  if (Platform.OS === 'web') {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }
  return AppState.currentState === 'active';
}

/** Resolves once the query isn't fetching (loaded, failed or paused offline). */
function settled(q: Query): Promise<void> {
  if (q.state.fetchStatus !== 'fetching') return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = queryClient.getQueryCache().subscribe((e) => {
      if (e.query !== q || q.state.fetchStatus === 'fetching') return;
      unsubscribe();
      resolve();
    });
  });
}

export const realtime = new RealtimeClient();
