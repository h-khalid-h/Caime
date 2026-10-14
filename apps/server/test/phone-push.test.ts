/**
 * Phone push through Expo (ADR-14): a phone's token registered by the app, what each notification
 * tells Expo (a sound and the alerting channel unless it's activity, high priority for a ring),
 * Expo's tickets read (a phone the app is gone from drops its token; a failure is counted and
 * kept), nothing for a replacement or a session that ended, and the hourly probe (R78).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expoPush } from '../src/lib/expo-push';
import { notify, replaceShown } from '../src/lib/notify';
import { providerProbes } from '../src/lib/provider-health';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const TOKEN = 'expo-access-token-0123456789';
let t: TestApp;
let expo: Server;
let base: string;
let noor: Client;
/** What Expo's stand-in was sent, and with which authorization. */
const sent: Array<{ path: string; auth: string | undefined; body: Record<string, unknown> }> = [];

/** Answers as Expo does: a ticket per message, 200 even when the ticket is an error. */
function stand(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
  });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    sent.push({ path: req.url ?? '', auth: req.headers.authorization, body });
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ errors: [{ code: 'UNAUTHORIZED', message: 'bad token' }] }));
    }
    if (req.url?.endsWith('/getReceipts')) return res.end(JSON.stringify({ data: {} }));
    const to = String(body.to);
    if (to.includes('broken')) {
      res.statusCode = 500;
      return res.end('{}');
    }
    if (to.includes('gone'))
      return res.end(
        JSON.stringify({
          data: {
            status: 'error',
            message: `"${to}" is not a registered push notification recipient`,
            details: { error: 'DeviceNotRegistered', expoPushToken: to },
          },
        }),
      );
    res.end(JSON.stringify({ data: { status: 'ok', id: 'ticket-1' } }));
  });
}

const subscribe = (who: Client, token: string) =>
  who.req('POST', '/v1/push/subscriptions', { kind: 'expo', token });

const subscriptions = (userId: string) =>
  t.ctx.db
    .selectFrom('push_subscriptions')
    .select(['endpoint', 'failures', 'last_success_at'])
    .where('user_id', '=', userId)
    .orderBy('endpoint')
    .execute();

const tell = (userId: string, level: 'activity' | 'attention' | 'urgency', ttlSeconds?: number) =>
  notify(t.ctx, {
    userId,
    kind: 'message',
    level,
    title: 'Lina Farah',
    body: 'Are you free on Thursday?',
    data: { conversationId: 'c-1' },
    groupKey: 'conv:c-1',
    ttlSeconds,
  });

beforeAll(async () => {
  expo = createServer(stand);
  await new Promise<void>((resolve) => expo.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(expo.address() as AddressInfo).port}/--/api/v2/push`;
  t = await createTestApp({ EXPO_PUSH_URL: base, EXPO_ACCESS_TOKEN: TOKEN });
  noor = await signup(t, { displayName: 'Noor Haddad' });
});
afterAll(async () => {
  await t.close();
  expo.close();
});
beforeEach(() => {
  sent.length = 0;
});

describe('phone push (Expo)', () => {
  it('tells Expo what the phone shows: words, a sound and its channel, where a tap leads', async () => {
    expect((await subscribe(noor, 'ExponentPushToken[noor-phone]')).statusCode).toBe(201);
    const id = await tell(noor.user.id, 'attention');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.path).toBe('/--/api/v2/push/send');
    expect(sent[0]?.auth).toBe(`Bearer ${TOKEN}`);
    expect(sent[0]?.body).toEqual({
      to: 'ExponentPushToken[noor-phone]',
      title: 'Lina Farah',
      body: 'Are you free on Thursday?',
      data: { conversationId: 'c-1', id },
      sound: 'default',
      channelId: 'messages',
      priority: 'default',
      ttl: 86_400,
    });
    const note = await t.ctx.db
      .selectFrom('notifications')
      .select('pushed_at')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(note.pushed_at).not.toBeNull();
    const [sub] = await subscriptions(noor.user.id);
    expect(sub?.last_success_at).not.toBeNull();
  });

  it('a ring is urgent and short-lived; activity arrives without a sound', async () => {
    await tell(noor.user.id, 'urgency', 45);
    await tell(noor.user.id, 'activity');
    expect(sent.map((s) => [s.body.priority, s.body.ttl, s.body.sound, s.body.channelId])).toEqual([
      ['high', 45, 'default', 'messages'],
      ['default', 86_400, null, 'quiet'],
    ]);
  });

  it('never sends a replacement to a phone: Expo cannot swap what it shows', async () => {
    await replaceShown(t.ctx, 'n-over', {
      userId: noor.user.id,
      kind: 'call',
      level: 'activity',
      title: 'Missed call',
    });
    expect(sent).toEqual([]);
  });

  it('a phone the app is gone from drops its token; a failure is counted and kept', async () => {
    const lina = await signup(t, { displayName: 'Lina Farah' });
    await subscribe(lina, 'ExponentPushToken[lina-gone]');
    await subscribe(lina, 'ExponentPushToken[lina-broken]');
    await subscribe(lina, 'ExponentPushToken[lina-ok]');
    await tell(lina.user.id, 'attention');
    expect(sent).toHaveLength(3);
    expect(
      (await subscriptions(lina.user.id)).map((s) => [s.endpoint, s.failures, !!s.last_success_at]),
    ).toEqual([
      ['ExponentPushToken[lina-broken]', 1, false],
      ['ExponentPushToken[lina-ok]', 0, true],
    ]);
    const scrape = await t.ctx.metrics.render();
    expect(scrape).toMatch(/caime_push_total\{channel="expo",outcome="expired"\} 1/);
    expect(scrape).toMatch(/caime_push_total\{channel="expo",outcome="failed"\} 1/);
  });

  it('a session that ended hears nothing more on that phone', async () => {
    const sami = await signup(t, { displayName: 'Sami Aziz' });
    await subscribe(sami, 'ExponentPushToken[sami-phone]');
    expect((await sami.req('POST', '/v1/auth/logout')).statusCode).toBe(200);
    await tell(sami.user.id, 'urgency');
    expect(sent).toEqual([]);
  });

  it('tells a phone which of what it shows are still unread, and what each says now', async () => {
    const zara = await signup(t, { displayName: 'Zara Malik' });
    const kept = await tell(zara.user.id, 'attention');
    const read = await tell(zara.user.id, 'attention');
    const erased = await tell(zara.user.id, 'attention');
    const gone = await tell(zara.user.id, 'attention');
    const theirs = await tell(noor.user.id, 'attention');
    await zara.req('POST', '/v1/notifications/read', { ids: [read] });
    // A burst whose words were taken back with a deleted message: it stays, without them.
    await t.ctx.db
      .updateTable('notifications')
      .set({ body: null })
      .where('id', '=', erased)
      .execute();
    await t.ctx.db.deleteFrom('notifications').where('id', '=', gone).execute();
    const res = await zara.req('POST', '/v1/notifications/shown', {
      ids: [kept, read, erased, gone, theirs],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().unread).toEqual([
      { id: kept, body: 'Are you free on Thursday?' },
      { id: erased, body: null },
    ]);
    expect((await zara.req('POST', '/v1/notifications/shown', { ids: [] })).json()).toEqual({
      unread: [],
    });
  });

  it('is probed hourly with its token, the cheapest read it has', async () => {
    const probe = providerProbes(t.ctx).find((p) => p.id === 'expo');
    expect(probe?.name).toBe('Expo (650 Industries, Inc.)');
    await probe?.check();
    expect(sent.map((s) => [s.path, s.body])).toEqual([
      ['/--/api/v2/push/getReceipts', { ids: [] }],
    ]);
    await expect(
      expoPush({ EXPO_PUSH_URL: base, EXPO_ACCESS_TOKEN: 'wrong' }).ping(),
    ).rejects.toThrow(/401/);
  });
});
