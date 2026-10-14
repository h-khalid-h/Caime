/**
 * Phone push through Expo's push service (ADR-14): the phone apps register an Expo push token
 * (`POST /push/subscriptions`, kind `expo`), and a notification is one message to it. Expo answers
 * every message with a ticket even when the request succeeds, and a ticket that says
 * `DeviceNotRegistered` means the app is gone from that phone: the token is dropped then, never
 * retried. One deadline covers the whole exchange, as for a browser's push service. A replacement
 * (`quiet`, a ring that's over) never goes to a phone: Expo can't swap what a phone shows, and the
 * app clears its own once they're read (`closeShownNotifications`).
 */
import type { NotificationLevel } from '@caime/core';
import { PUSH_CHANNELS } from '@caime/core/api';
import type { Config } from '../config';

/** What Expo's service is told for one notification. */
export interface ExpoMessage {
  token: string;
  /** The notification's id, which the app matches when it's read elsewhere. */
  id: string;
  title: string;
  body: string | null;
  level: NotificationLevel;
  data: Record<string, unknown>;
  ttlSeconds?: number;
}

/** How a push went, to a phone or a browser: delivered, the device gone for good, or a failure. */
export type PushOutcome = 'delivered' | 'expired' | 'failed';

const DEADLINE_MS = 10_000;

export interface ExpoPush {
  send(message: ExpoMessage): Promise<PushOutcome>;
  /** The cheapest authenticated read: receipts for no tickets (provider health, R78). */
  ping(): Promise<void>;
}

/** Expo's message for a notification: a sound and the alerting channel unless it's activity. */
export function expoBody(m: ExpoMessage) {
  const alerting = m.level !== 'activity';
  return {
    to: m.token,
    title: m.title,
    body: m.body ?? '',
    data: { ...m.data, id: m.id },
    sound: alerting ? 'default' : null,
    channelId: alerting ? PUSH_CHANNELS.alert : PUSH_CHANNELS.quiet,
    priority: m.level === 'urgency' ? 'high' : 'default',
    // As long as a browser's: a day, unless the notification says less (a ring).
    ttl: m.ttlSeconds ?? 24 * 3600,
  };
}

interface Ticket {
  status?: string;
  details?: { error?: string };
}

/** Expo's answer read: one ticket for one message (an object, or a list of one). */
export function outcomeOf(status: number, json: unknown): PushOutcome {
  if (status < 200 || status >= 300) return 'failed';
  const data = (json as { data?: Ticket | Ticket[] } | null)?.data;
  const ticket = Array.isArray(data) ? data[0] : data;
  if (ticket?.status === 'ok') return 'delivered';
  if (ticket?.details?.error === 'DeviceNotRegistered') return 'expired';
  return 'failed';
}

export function expoPush(
  config: Pick<Config, 'EXPO_ACCESS_TOKEN' | 'EXPO_PUSH_URL'>,
  fetcher: typeof fetch = fetch,
): ExpoPush {
  const base = config.EXPO_PUSH_URL.replace(/\/+$/, '');
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    ...(config.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` } : {}),
  };
  return {
    async send(m) {
      try {
        const res = await fetcher(`${base}/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify(expoBody(m)),
          signal: AbortSignal.timeout(DEADLINE_MS),
        });
        const json = await res.json().catch(() => null);
        return outcomeOf(res.status, json);
      } catch {
        return 'failed';
      }
    },
    async ping() {
      const res = await fetcher(`${base}/getReceipts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: [] }),
        signal: AbortSignal.timeout(DEADLINE_MS),
      });
      if (!res.ok) throw new Error(`Expo answered ${res.status}`);
      const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
      if (!json || typeof json.data !== 'object') throw new Error('Expo answered without data');
    },
  };
}
