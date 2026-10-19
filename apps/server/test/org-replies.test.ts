/**
 * An organization's replies (M16 H2): quick replies its team keeps, a greeting the first time a
 * customer writes (and after a quiet fortnight), and an away message while its hours say it's
 * closed, ending with when it opens again in the customer's language and on their clock. Both
 * come from its automatic-replies account, marked automated, never moving the thread, and
 * neither while its AI agent answers; no away message while someone on the team is answering.
 * A stand-in answers the mail provider (a customer reached by mail hears them as automatic
 * replies) and the Messages API (the agent).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4, uuidv7 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { runDueJobs } from '../src/lib/jobs';
import { clearClosedOrg } from '../src/lib/org-data';
import { busSettled, type Client, createTestApp, signup, type TestApp } from './helpers';
import { mailDns, rawMail, SENDER_IP } from './mail-fixtures';

const SECRET = 'a-webhook-secret-of-length';
const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  // Sunday to Thursday, 09:00–12:00 Cairo (UTC+3 in October 2026: 06:00–09:00Z).
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};
const GREETING = 'Welcome to Nile Dental! Tell us what you need.';
const AWAY = 'Thanks for writing. We answer as soon as we’re back.';

let t: TestApp;
let stub: Server;
const sends: Array<Record<string, unknown>> = [];
const heard: BusMessage[] = [];
let noor: Client; // owner
let omar: Client; // on the team
let lina: Client; // a customer
let orgId: string;

const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const messages = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[];
/** What the organization said by itself in a conversation, as the customer reads it. */
const autoReplies = async (c: Client, conversationId: string) =>
  (await messages(c, conversationId)).filter((m) => m.payload?.autoReply);
/** The replies wait for the message's effects, then their jobs run. */
async function settle(ms = 5000) {
  await t.ctx.flush();
  t.clock.advance(ms);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
}
async function customer(name: string) {
  const c = await signup(t, { displayName: name, timeZone: 'Africa/Cairo' });
  const conversationId = (await c.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  return { c, conversationId };
}

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/email') {
      sends.push(body);
      return res.end(JSON.stringify({ MessageID: `pm-out-${sends.length}`, ErrorCode: 0 }));
    }
    // The Messages API: the agent's answer, for the one case that turns it on.
    res.end(
      JSON.stringify({
        id: 'msg_stub',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              action: 'answer',
              message: 'We open at nine.',
              bookAt: null,
              bookFor: null,
              bookItem: null,
              orderLines: null,
              orderWay: null,
            }),
          },
        ],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 300, output_tokens: 40 },
      }),
    );
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp({
    MAIL_DOMAIN: 'caime.test',
    MAIL_PROVIDER: 'postmark',
    MAIL_PROVIDER_TOKEN: 'test-postmark-token',
    MAIL_WEBHOOK_SECRET: SECRET,
    MAIL_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
  });
  t.ctx.dns = mailDns();
  t.ctx.bus.subscribe((m) => heard.push(m));
  // Thursday 1 October 2026, 05:00Z: 08:00 in Cairo, an hour before it opens.
  t.clock.set('2026-10-01T05:00:00Z');
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor.haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah', timeZone: 'Africa/Cairo' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  await noor.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: HOURS });
});

afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('quick replies (M16 H2)', () => {
  it('are kept by its owner and admins, read by its team alone, and told to the team', async () => {
    const list = [
      { shortcut: 'hours', body: 'We’re open Sunday to Thursday, 9 to 12.' },
      { shortcut: 'price', body: 'A check-up is 400 EGP.' },
    ];
    expect(
      (await omar.req('PUT', `/v1/orgs/${orgId}/quick-replies`, { replies: list })).statusCode,
    ).toBe(403);
    expect(
      (await lina.req('PUT', `/v1/orgs/${orgId}/quick-replies`, { replies: list })).statusCode,
    ).toBe(404);
    // A shortcut is one word, and two that read the same without case are one.
    for (const bad of [
      [{ shortcut: 'two words', body: 'x' }],
      [
        { shortcut: 'Hours', body: 'x' },
        { shortcut: 'hours', body: 'y' },
      ],
      [{ shortcut: 'empty', body: '  ' }],
    ])
      expect(
        (await noor.req('PUT', `/v1/orgs/${orgId}/quick-replies`, { replies: bad })).statusCode,
      ).toBe(400);
    heard.length = 0;
    const saved = await noor.req('PUT', `/v1/orgs/${orgId}/quick-replies`, { replies: list });
    expect(saved.statusCode).toBe(200);
    const kept = saved.json().replies as Array<{ id: string; shortcut: string; body: string }>;
    expect(kept.map((r) => r.shortcut)).toEqual(['hours', 'price']);
    // The team's composers ask again: everyone on it hears, nobody else.
    await busSettled(t, heard);
    const told = heard.filter(
      (m) =>
        m.event.type === 'business.updated' &&
        (m.event.data as Record<string, unknown>).quickReplies === true,
    );
    expect(told.flatMap((m) => m.userIds).sort()).toEqual([noor.user.id, omar.user.id].sort());
    expect((await omar.get(`/v1/orgs/${orgId}/quick-replies`)).replies).toEqual(kept);
    expect((await lina.req('GET', `/v1/orgs/${orgId}/quick-replies`)).statusCode).toBe(404);
    // Saved again in another order: the same ones keep their ids; an id that isn't one of its
    // own is a new reply, never someone else's row.
    const again = await noor.req('PUT', `/v1/orgs/${orgId}/quick-replies`, {
      replies: [
        { id: kept[1]?.id, shortcut: 'price', body: 'A check-up is 450 EGP.' },
        { id: kept[0]?.id, shortcut: 'hours', body: kept[0]?.body },
        { id: uuidv7(), shortcut: 'where', body: '12 Nile Street.' },
      ],
    });
    expect(again.statusCode).toBe(200);
    const now = again.json().replies as Array<{ id: string; shortcut: string; body: string }>;
    expect(now.map((r) => [r.shortcut, r.id === kept[1]?.id || r.id === kept[0]?.id])).toEqual([
      ['price', true],
      ['hours', true],
      ['where', false],
    ]);
    expect(now[0]?.body).toBe('A check-up is 450 EGP.');
  });
});

describe('a greeting and an away message (M16 H2)', () => {
  it('are set by its owner and admins and shown to them alone', async () => {
    expect((await omar.req('PATCH', `/v1/orgs/${orgId}`, { greeting: GREETING })).statusCode).toBe(
      403,
    );
    const set = await noor.patch(`/v1/orgs/${orgId}`, { greeting: GREETING, away: AWAY });
    expect(set.org.replies).toEqual({ greeting: GREETING, away: AWAY });
    expect((await omar.get(`/v1/orgs/${orgId}`)).org.replies).toBeNull();
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.replies).toBeNull();
  });

  it('greet a customer who writes first and, while closed, say when it opens again, once', async () => {
    const convo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
    await send(lina, convo, 'Hello, can I come today?');
    await settle();
    const said = await autoReplies(lina, convo);
    expect(said.map((m) => m.payload.autoReply)).toEqual(['greeting', 'away']);
    expect(said[0]?.body).toBe(GREETING);
    // The organization's words, then when it opens: 09:00 in Cairo, where Lina is too.
    expect(said[1]?.body).toBe(`${AWAY}\n\nWe’re open again at 9:00 AM.`);
    // From the organization, marked as automated: nobody on its team is named.
    for (const m of said) {
      expect(m.senderId).toBe(orgId);
      expect(m.automated).toBe(true);
    }
    // They never answer for the team: the customer still waits for a person.
    const thread = (await omar.get(`/v1/conversations/${convo}`)).conversation.business.thread;
    expect(thread.waitingSince).not.toBeNull();
    expect(thread.assignee).toBeNull();
    // Writing again in the same closed spell, or in the same quiet stretch, says nothing more.
    await send(lina, convo, 'Or tomorrow?');
    await settle();
    expect(await autoReplies(lina, convo)).toHaveLength(2);
    // Nobody on the team was told of what the organization said by itself.
    const told = (await omar.get('/v1/notifications')).notifications.filter(
      (n: any) => n.data?.conversationId === convo,
    );
    expect(told.every((n: any) => !String(n.body ?? '').includes(GREETING))).toBe(true);
  });

  it('greet alone while open, keep the away message off while the team is answering, and greet again after a quiet fortnight', async () => {
    // 10:00 in Cairo: open.
    t.clock.set('2026-10-01T07:00:00Z');
    const rana = await customer('Rana Said');
    await send(rana.c, rana.conversationId, 'Do you do whitening?');
    await settle();
    expect(
      (await autoReplies(rana.c, rana.conversationId)).map((m) => m.payload.autoReply),
    ).toEqual(['greeting']);
    // Closed at noon; Omar is answering her at one, so her answer hears no away message.
    t.clock.set('2026-10-01T10:00:00Z');
    await send(omar, rana.conversationId, 'We do. Would Sunday suit you?');
    t.clock.set('2026-10-01T10:10:00Z');
    await send(rana.c, rana.conversationId, 'Sunday is good.');
    await settle();
    expect(await autoReplies(rana.c, rana.conversationId)).toHaveLength(1);
    // Two hours on, nobody is: it's closed until Sunday, and says that day as she writes dates.
    t.clock.set('2026-10-01T12:30:00Z');
    await send(rana.c, rana.conversationId, 'What time on Sunday?');
    await settle();
    const away = (await autoReplies(rana.c, rana.conversationId)).at(-1);
    expect(away?.payload.autoReply).toBe('away');
    expect(away?.body).toMatch(/We’re open again on Sun, Oct 4, 9:00 AM\.$/);
    // Fifteen quiet days later, on a Monday morning while open: greeted again, no away message.
    t.clock.set('2026-10-19T07:00:00Z');
    await send(rana.c, rana.conversationId, 'Hello again!');
    await settle();
    expect(
      (await autoReplies(rana.c, rana.conversationId)).map((m) => m.payload.autoReply),
    ).toEqual(['greeting', 'away', 'greeting']);
  });

  it('say when it opens in the language the customer wrote in', async () => {
    t.clock.set('2026-10-01T05:00:00Z');
    const amal = await customer('Amal Hassan');
    await send(amal.c, amal.conversationId, 'مرحبا، هل العيادة مفتوحة اليوم؟');
    await settle();
    const away = (await autoReplies(amal.c, amal.conversationId)).at(-1);
    // The organization's words as it wrote them; Caime's line in Arabic, with Arabic's clock.
    expect(away?.body.startsWith(AWAY)).toBe(true);
    expect(away?.body).toMatch(/\n\nنعود الساعة .+\.$/);
  });

  it('turned off, say nothing; a reply already asked for that was turned off since says nothing either', async () => {
    t.clock.set('2026-10-01T05:00:00Z');
    const sami = await customer('Sami Nour');
    await send(sami.c, sami.conversationId, 'Hi');
    // Turned off before its job runs: what it would have said is read again when it's sent.
    await t.ctx.flush();
    await noor.patch(`/v1/orgs/${orgId}`, { greeting: '', away: null });
    await settle();
    expect(await autoReplies(sami.c, sami.conversationId)).toEqual([]);
    expect((await noor.get(`/v1/orgs/${orgId}`)).org.replies).toEqual({
      greeting: null,
      away: null,
    });
    await noor.patch(`/v1/orgs/${orgId}`, { greeting: GREETING, away: AWAY });
  });

  it('reach a customer who wrote by mail as automatic replies, never tracked', async () => {
    t.clock.set('2026-10-01T05:00:00Z');
    const raw = await rawMail({
      from: 'patient@clinic-customer.example',
      fromName: 'Hana Patient',
      to: ['nile.dental@caime.test'],
      subject: 'Open today?',
      text: 'Are you open today?',
      messageId: '<in-1@clinic-customer.example>',
      dkim: 'valid',
      hop: { ip: SENDER_IP, envelopeFrom: 'patient@clinic-customer.example' },
      senderLines: [],
    });
    const res = await t.app.inject({
      method: 'POST',
      url: `/v1/mail/in/postmark?secret=${SECRET}`,
      payload: {
        FromFull: { Email: 'patient@clinic-customer.example', Name: 'Hana Patient' },
        ToFull: [{ Email: 'nile.dental@caime.test', Name: '' }],
        Subject: 'Open today?',
        MessageID: 'pm-in-1',
        TextBody: 'Are you open today?',
        HtmlBody: '',
        Headers: [{ Name: 'Message-ID', Value: '<in-1@clinic-customer.example>' }],
        Attachments: [],
        RawEmail: raw,
      },
    });
    expect(res.json().outcomes[0].outcome).toBe('delivered');
    sends.length = 0;
    await settle();
    // The mail out after each.
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    expect(sends).toHaveLength(2);
    for (const s of sends) {
      expect(s.From).toBe('Nile Dental <nile.dental@caime.test>');
      expect(s.Headers).toContainEqual({ Name: 'Auto-Submitted', Value: 'auto-replied' });
      expect(s.TrackOpens).toBeUndefined();
      expect(String(s.TextBody)).not.toContain('is told when this mail is opened');
    }
    // On the organization's clock: someone reached by mail has none on Caime.
    expect(String(sends[1]?.TextBody)).toContain('We’re open again at 9:00 AM.');
  });

  it('wait while its AI agent answers, which introduces itself instead', async () => {
    t.clock.set('2026-10-01T05:00:00Z');
    const made = await noor.req('PUT', `/v1/orgs/${orgId}/agent`, {
      name: 'Nile Dental Assistant',
      knowledge:
        'Nile Dental is open Sunday to Thursday 9am to 12pm. A check-up is 400 EGP. We are at 12 Nile Street.',
    });
    expect(made.statusCode).toBe(200);
    const huda = await customer('Huda Amin');
    await send(huda.c, huda.conversationId, 'Are you open now?');
    await t.ctx.flush();
    const asked = await t.ctx.db
      .selectFrom('jobs')
      .select('kind')
      .where('kind', '=', 'org.reply')
      .where('dedupe_key', 'like', `%:${huda.conversationId}:%`)
      .execute();
    expect(asked).toEqual([]);
  });
});

describe('what an organization says by itself, kept and let go (M16 H2)', () => {
  it('is in its export and goes when its closed record is cleared', async () => {
    const owner = await signup(t, { displayName: 'Dina Owner' });
    const id = (
      await owner.post('/v1/orgs', {
        country: 'EG',
        name: 'Brief Cafe',
        handle: 'brief.cafe',
        kind: 'shop',
      })
    ).org.id;
    await owner.patch(`/v1/orgs/${id}`, { greeting: 'Hello from Brief Cafe' });
    await owner.req('PUT', `/v1/orgs/${id}/quick-replies`, {
      replies: [{ shortcut: 'menu', body: 'Coffee, tea, cake.' }],
    });
    await owner.post(`/v1/orgs/${id}/close`, {});
    const exported = await owner.get(`/v1/orgs/${id}/export`);
    expect(exported.replies).toEqual({
      greeting: 'Hello from Brief Cafe',
      away: null,
      quick: [{ shortcut: 'menu', body: 'Coffee, tea, cake.' }],
    });
    t.clock.advance(31 * 86_400_000);
    try {
      expect(await clearClosedOrg(t.ctx, id)).toBe(true);
    } finally {
      t.clock.advance(-31 * 86_400_000);
    }
    const left = await t.ctx.db
      .selectFrom('org_quick_replies')
      .select('id')
      .where('org_id', '=', id)
      .execute();
    expect(left).toEqual([]);
    const org = await t.ctx.db
      .selectFrom('organizations')
      .select(['greeting', 'away_message'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(org).toEqual({ greeting: null, away_message: null });
  });
});
