/**
 * One WebSocket per device (ARCHITECTURE.md "Realtime protocol"). The web authenticates with its
 * cookie during the upgrade; native sends its token as the first frame. It reconnects with
 * backoff, and after every reconnect it catches up on whatever it missed while away.
 */
import type { RealtimeFrame } from '@caishy/core/api';
import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform } from 'react-native';
import { getAuthToken } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { queryClient } from '@/api/queryClient';
import { WS_URL } from '@/lib/config';
import { type MessagePages, maxSeq, upsertMessage } from '@/state/cache';
import { useLive } from '@/state/live';
import { useOutbox } from '@/state/outbox';
import { applyEvent } from './apply';

const PING_MS = 25_000;
const STALE_MS = 60_000;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private wanted = false;
  private me: string | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;
  private everConnected = false;
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
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
    this.clearTimers();
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
    if (this.ws && Date.now() - this.lastFrameAt < STALE_MS) return;
    this.ws?.close();
    this.ws = null;
    this.attempt = 0;
    this.connect();
  }

  private send(frame: object): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(frame));
  }

  private listen(): void {
    this.unsubscribers.push(
      NetInfo.addEventListener((s) => {
        if (s.isConnected === false) useLive.getState().setConnection('offline');
        else this.nudge();
      }),
    );
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') this.nudge();
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
    this.retryTimer = null;
    this.pingTimer = null;
  }

  private connect(): void {
    if (!this.wanted || this.ws) return;
    this.clearTimers();
    useLive.getState().setConnection('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_URL}/v1/realtime`);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
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
      if (frame.type === 'hello') this.onHello();
      else if (frame.type === 'event' && this.me) applyEvent(queryClient, frame.event, this.me);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.wanted) {
        useLive.getState().setConnection('connecting');
        this.scheduleRetry();
      }
    };
    ws.onerror = () => {
      // onclose follows and schedules the retry.
    };
  }

  private onHello(): void {
    this.attempt = 0;
    useLive.getState().setConnection('open');
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastFrameAt > STALE_MS) {
        this.ws?.close();
        return;
      }
      this.send({ type: 'ping' });
    }, PING_MS);
    if (this.everConnected) void this.catchUp();
    this.everConnected = true;
    useOutbox.getState().flush();
  }

  private scheduleRetry(): void {
    const base = Math.min(30_000, 1000 * 2 ** this.attempt);
    this.attempt += 1;
    const delay = base / 2 + Math.random() * (base / 2);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  /** After a gap: refresh the lists, and fetch what each open conversation missed. */
  private async catchUp(): Promise<void> {
    void queryClient.invalidateQueries({ queryKey: qk.inbox });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
    const cached = queryClient.getQueryCache().findAll({ queryKey: ['messages'] });
    const active = cached.filter((q) => q.getObserversCount() > 0);
    for (const q of active) {
      const id = String(q.queryKey[1]);
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

export const realtime = new RealtimeClient();
