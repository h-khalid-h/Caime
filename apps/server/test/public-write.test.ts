/**
 * Writing to an organization before an account (R97 (1), M16 C1d): a visitor on its page, or
 * arriving by its door, writes with a name, an address and the message, proves the address with
 * a code, and the message lands in the Business inbox as their provisional self's; the team's
 * answer goes back by mail from the organization's address, and a reply to that mail comes back
 * into the same conversation. A stand-in answers the mail provider's API.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { runDueJobs } from '../src/lib/jobs';
import { productMetrics } from '../src/lib/product-metrics';
import { CLAIM_MS } from '../src/lib/public-booking';
import { type Client, createTestApp, signup, type TestApp } from './helpers';
import { mailDns, rawMail, SENDER_IP } from './mail-fixtures';

const SECRET = 'a-webhook-secret-of-length';
const HANDLE = 'nile.write';
const PAGE = `/o/${HANDLE}`;

let t: TestApp;
let dir: string;
let stub: Server;
let noor: Client;
let orgId: string;
const mail = memoryMailer();
const sends: Array<Record<string, unknown>> = [];

/** The app's shell, as the export leaves it: the pages are written into it (R44). */
function shell(): string {
  const at = mkdtempSync(join(tmpdir(), 'caime-public-write-'));
  writeFileSync(
    join(at, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(at, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(at, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  return at;
}

const form = (url: string, fields: Record<string, string>) =>
  t.app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(fields).toString(),
  });

const page = async (query = '') => {
  const res = await t.app.inject({ url: `${PAGE}${query}`, headers: { accept: 'text/html' } });
  expect(res.statusCode).toBe(200);
  return res.body;
};

const lastMailTo = (address: string) => mail.outbox.filter((m) => m.to === address).at(-1);

const codeFor = (address: string) => {
  const sent = lastMailTo(address);
  expect(sent, `a code to ${address}`).toBeDefined();
  return /^(\d{6}) /.exec(sent?.subject ?? '')?.[1] ?? '';
};

const paramOf = (location: string | undefined, name: string) =>
  new URL(location ?? '', 'http://x').searchParams.get(name);

/** Step one, as the page's form posts it; the claim from where it sends the visitor. */
async function start(fields: Record<string, string>) {
  const res = await form('/v1/public/write', { org: HANDLE, ...fields });
  expect(res.statusCode).toBe(303);
  const location = res.headers.location as string;
  expect(location.startsWith(`${PAGE}?`)).toBe(true);
  expect(location.endsWith('#write')).toBe(true);
  return {
    location,
    claim: paramOf(location, 'write-code'),
    error: paramOf(location, 'write-error'),
  };
}

/** The team's thread with a customer, by the customer's name. */
async function threadOf(customer: string) {
  const inbox = await noor.get(`/v1/orgs/${orgId}/inbox`);
  return inbox.threads.find((th: any) => th.customer?.displayName === customer);
}

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/email') {
      sends.push(JSON.parse(raw || '{}') as Record<string, unknown>);
      return res.end(JSON.stringify({ MessageID: `pm-out-${sends.length}`, ErrorCode: 0 }));
    }
    res.end('{}');
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  dir = shell();
  t = await createTestApp(
    {
      WEB_DIR: dir,
      PUBLIC_URL: 'https://caime.example',
      MAIL_DOMAIN: 'caime.test',
      MAIL_PROVIDER: 'postmark',
      MAIL_PROVIDER_TOKEN: 'test-postmark-token',
      MAIL_WEBHOOK_SECRET: SECRET,
      MAIL_BASE_URL: `http://127.0.0.1:${port}`,
    },
    { mail },
  );
  t.ctx.dns = mailDns();
  noor = await signup(t, { displayName: 'Noor Hassan', handle: 'noorw', country: 'EG' });
  const org = await noor.post('/v1/orgs', {
    country: 'EG',
    name: 'Nile Dental',
    handle: HANDLE,
    kind: 'clinic',
  });
  orgId = org.org.id;
  // Something it offers, so the page has more than the form to put it among.
  await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
    booking: {
      timeZone: 'Africa/Cairo',
      slotMinutes: 30,
      days: [1, 2, 3].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
      leadMinutes: 60,
      horizonDays: 14,
    },
    items: [
      {
        id: 'cleaning',
        name: 'Teeth cleaning',
        price: { value: 400, currency: 'EGP' },
        unit: 'minutes',
        minutes: 30,
        capacity: 1,
        maxQuantity: 1,
        audience: 'public',
        providers: null,
        askTopic: false,
      },
    ],
  });
});
afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
  rmSync(dir, { recursive: true, force: true });
});

describe('writing to an organization before an account (R97 (1))', () => {
  it('offers three fields on its page, first when they came by the door', async () => {
    const plain = await page();
    expect(plain).toContain('id="write"');
    expect(plain).toContain('action="/v1/public/write"');
    for (const field of ['name="name"', 'name="email"', 'name="message"'])
      expect(plain).toContain(field);
    // Its way in is the form on the page now, not sign-up.
    expect(plain).toContain('href="#write"');
    expect(plain).toContain('Message Nile Dental');
    expect(plain).not.toContain('Message Nile Dental on Caime');
    // Caime Mail carries the answer, and the page says so.
    expect(plain).toContain('Nile Dental answers by email: no account needed.');
    // Unverified: the page asks whether they're 18 or over (R29).
    expect(plain).toContain('name="adult"');
    // On the plain page the form waits below what the organization offers; the door (`?write`,
    // its link and QR) leads with it, above anything else on the page.
    const offered = (html: string) => html.indexOf('Teeth cleaning', html.indexOf('</section>'));
    expect(offered(plain)).toBeGreaterThan(0);
    expect(plain.indexOf('id="write"')).toBeGreaterThan(offered(plain));
    const door = await page('?write');
    expect(door.indexOf('id="write"')).toBeLessThan(offered(door));
  });

  it('sends a code, then puts the message in the inbox as the visitor’s; twice is once', async () => {
    const before = mail.outbox.length;
    const asked = await start({
      name: 'Hana Patient',
      email: 'hana@example.com',
      message: 'Do you have time on Saturday for a check-up?\r\nI can come any time.',
      adult: 'on',
      lang: 'en',
    });
    expect(asked.error).toBeNull();
    expect(asked.claim).toBeTruthy();
    expect(asked.location).toContain('lang=en');
    await t.ctx.flush();
    expect(mail.outbox.length).toBe(before + 1);
    // The code's mail says what happens without it, for someone who never signed up.
    expect(lastMailTo('hana@example.com')?.text).toContain('nothing is booked or sent');
    const code = codeFor('hana@example.com');
    expect(code).toMatch(/^\d{6}$/);
    // Nothing is in the inbox before the code comes back.
    expect(await threadOf('Hana Patient')).toBeUndefined();
    const step = await page(`?write-code=${asked.claim}`);
    expect(step).toContain('action="/v1/public/write/confirm"');
    expect(step).toContain('hana@example.com');
    // A wrong code counts and stays on the step.
    const wrong = await form('/v1/public/write/confirm', {
      org: HANDLE,
      claim: asked.claim as string,
      code: code === '000000' ? '111111' : '000000',
    });
    expect(paramOf(wrong.headers.location as string, 'write-error')).toBe('wrong_code');
    expect(paramOf(wrong.headers.location as string, 'write-code')).toBe(asked.claim);
    const done = await form('/v1/public/write/confirm', {
      org: HANDLE,
      claim: asked.claim as string,
      code,
    });
    expect(done.statusCode).toBe(303);
    expect(paramOf(done.headers.location as string, 'written')).toBe(asked.claim);
    const sent = await page(`?written=${asked.claim}`);
    expect(sent).toContain('Your message is with Nile Dental.');
    expect(sent).toContain('Their answer comes to hana@example.com by email.');
    await t.ctx.flush();
    // In the team's inbox, from the provisional customer, in their words (the lines as one kind).
    const thread = await threadOf('Hana Patient');
    expect(thread).toBeDefined();
    const messages = await noor.get(`/v1/conversations/${thread.conversationId}/messages`);
    const words = messages.messages.filter((m: any) => m.kind === 'text');
    expect(words).toHaveLength(1);
    expect(words[0].body).toBe(
      'Do you have time on Saturday for a check-up?\nI can come any time.',
    );
    const person = await t.ctx.db
      .selectFrom('users')
      .select(['kind', 'display_name', 'email'])
      .where('id', '=', words[0].senderId)
      .executeTakeFirstOrThrow();
    expect(person).toEqual({
      kind: 'provisional',
      display_name: 'Hana Patient',
      email: 'hana@example.com',
    });
    // The team is told, as for any customer's message.
    const told = await noor.get('/v1/notifications');
    expect(
      told.notifications.some((n: any) => n.data?.conversationId === thread.conversationId),
    ).toBe(true);
    // The same claim posted again: written, with no second message and no second code.
    const mails = mail.outbox.length;
    const again = await form('/v1/public/write/confirm', {
      org: HANDLE,
      claim: asked.claim as string,
      code: '123456',
    });
    expect(paramOf(again.headers.location as string, 'written')).toBe(asked.claim);
    await t.ctx.flush();
    expect(mail.outbox.length).toBe(mails);
    const after = await noor.get(`/v1/conversations/${thread.conversationId}/messages`);
    expect(after.messages.filter((m: any) => m.kind === 'text')).toHaveLength(1);
    // Nothing of the team is on any of the visitor's pages (R15).
    for (const html of [step, sent]) expect(html).not.toContain('Noor Hassan');
  });

  it('the team’s answer goes by mail as an answer to what they wrote, and their reply comes back', async () => {
    const thread = await threadOf('Hana Patient');
    const convo = thread.conversationId as string;
    await noor.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'Yes, Saturday at 10 works. See you then.',
    });
    await t.ctx.flush();
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    const out = sends.at(-1);
    expect(out?.From).toBe('Nile Dental <nile.write@caime.test>');
    expect(out?.To).toBe('hana@example.com');
    // Threaded on what they wrote, never on the team's first line.
    expect(out?.Subject).toBe('Re: Do you have time on Saturday for a check-up?');
    const text = String(out?.TextBody);
    expect(text).toContain('Yes, Saturday at 10 works.');
    // The first mail to an address that never wrote by mail says who and how to answer (R93).
    expect(text).toContain(
      'Nile Dental wrote this on Caime, from nile.write@caime.test. Reply to this mail to answer',
    );
    expect(text).not.toContain('Noor Hassan');
    // Their reply, from their own mail, lands in the same conversation.
    const sentId = await t.ctx.db
      .selectFrom('mail_messages')
      .select('rfc_message_id')
      .where('to_address', '=', 'hana@example.com')
      .where('direction', '=', 'out')
      .executeTakeFirstOrThrow();
    const raw = await rawMail({
      from: 'hana@example.com',
      fromName: 'Hana Patient',
      to: ['nile.write@caime.test'],
      subject: 'Re: Do you have time on Saturday for a check-up?',
      text: 'Perfect, thank you!',
      messageId: '<reply-1@example.com>',
      inReplyTo: sentId.rfc_message_id,
      references: [sentId.rfc_message_id],
      dkim: 'valid',
      hop: { ip: SENDER_IP, envelopeFrom: 'hana@example.com' },
      senderLines: [],
    });
    const res = await t.app.inject({
      method: 'POST',
      url: `/v1/mail/in/postmark?secret=${SECRET}`,
      payload: {
        FromFull: { Email: 'hana@example.com', Name: 'Hana Patient' },
        ToFull: [{ Email: 'nile.write@caime.test', Name: '' }],
        Subject: 'Re: Do you have time on Saturday for a check-up?',
        MessageID: 'pm-in-reply-1',
        TextBody: 'Perfect, thank you!',
        HtmlBody: '',
        Headers: [{ Name: 'Message-ID', Value: '<reply-1@example.com>' }],
        Attachments: [],
        RawEmail: raw,
      },
    });
    expect(res.json().outcomes[0].outcome).toBe('delivered');
    const messages = await noor.get(`/v1/conversations/${convo}/messages`);
    expect(messages.messages.some((m: any) => m.body === 'Perfect, thank you!')).toBe(true);
  });

  it('sends an account’s address to sign in, never a code', async () => {
    await signup(t, { displayName: 'Omar Known', handle: 'omar.known', email: 'omar@example.com' });
    const before = mail.outbox.length;
    const asked = await start({
      name: 'Omar',
      email: 'omar@example.com',
      message: 'Hello',
      adult: 'on',
    });
    expect(asked.error).toBe('account');
    await t.ctx.flush();
    expect(mail.outbox.length).toBe(before);
    expect(await page('?write&write-error=account')).toContain('Sign in to message Nile Dental');
  });

  it('asks the age of anyone writing to an organization that hasn’t proved who it is', async () => {
    const unsure = await start({ name: 'Kid', email: 'kid@example.com', message: 'Hi there' });
    expect(unsure.error).toBe('adult');
    const empty = await start({
      name: 'Ana',
      email: 'ana@example.com',
      message: '  \r\n ',
      adult: 'on',
    });
    expect(empty.error).toBe('message');
    // Verified, an organization a minor may write to (R29): no box, and none needed.
    await t.ctx.db
      .updateTable('organizations')
      .set({ verified_at: new Date() })
      .where('id', '=', orgId)
      .execute();
    try {
      expect(await page()).not.toContain('name="adult"');
      const asked = await start({ name: 'Kid', email: 'kid@example.com', message: 'Hi there' });
      expect(asked.error).toBeNull();
      expect(asked.claim).toBeTruthy();
    } finally {
      await t.ctx.db
        .updateTable('organizations')
        .set({ verified_at: null })
        .where('id', '=', orgId)
        .execute();
    }
  });

  it('gives back what they wrote when a code is spent by tries, and says when a claim ran out', async () => {
    const asked = await start({
      name: 'Lina Late',
      email: 'lina@example.com',
      message: 'Is parking free?',
      adult: 'on',
    });
    await t.ctx.flush();
    const code = codeFor('lina@example.com');
    const wrongCode = code === '000000' ? '111111' : '000000';
    let last = '';
    for (let i = 0; i < 11; i++) {
      const res = await form('/v1/public/write/confirm', {
        org: HANDLE,
        claim: asked.claim as string,
        code: wrongCode,
      });
      last = res.headers.location as string;
    }
    expect(paramOf(last, 'write-error')).toBe('code_expired');
    const again = paramOf(last, 'write-again');
    expect(again).toBe(asked.claim);
    const form2 = await page(`?write-again=${again}&write-error=code_expired`);
    expect(form2).toContain('Is parking free?');
    expect(form2).toContain('value="lina@example.com"');
    // Fifteen minutes on, the claim says nothing more, and the page says it took too long.
    t.clock.advance(CLAIM_MS + 1000);
    const late = await form('/v1/public/write/confirm', {
      org: HANDLE,
      claim: asked.claim as string,
      code,
    });
    expect(paramOf(late.headers.location as string, 'write-error')).toBe('expired');
    expect(await page(`?write-code=${asked.claim}`)).toContain('That took too long');
    // A message already sent says nothing more once its claim has run out.
    expect(await page(`?written=${asked.claim}`)).not.toContain('That took too long');
  });

  it('offers no form without a mailer, and says joining shows the answer without Caime Mail', async () => {
    const { mail: mailer, mailProvider } = t.ctx;
    try {
      t.ctx.mailProvider = null;
      const joining = await page();
      expect(joining).toContain('Join Caime with that address to read the answer.');
      t.ctx.mail = null;
      const none = await page();
      expect(none).not.toContain('id="write"');
      expect(none).toContain('Message Nile Dental on Caime');
      const refused = await start({
        name: 'Noa',
        email: 'noa@example.com',
        message: 'Hello',
        adult: 'on',
      });
      expect(refused.error).toBe('no_mail');
    } finally {
      t.ctx.mail = mailer;
      t.ctx.mailProvider = mailProvider;
    }
  });

  it('counts each step, and the door’s numbers count messages written', async () => {
    expect(t.ctx.metrics.publicWrites.get({ outcome: 'code_sent' })).toBeGreaterThanOrEqual(3);
    expect(t.ctx.metrics.publicWrites.get({ outcome: 'written' })).toBeGreaterThanOrEqual(1);
    expect(t.ctx.metrics.publicWrites.get({ outcome: 'wrong_code' })).toBeGreaterThanOrEqual(1);
    expect(t.ctx.metrics.publicWrites.get({ outcome: 'account' })).toBe(1);
    expect(t.ctx.metrics.publicWrites.get({ outcome: 'adult' })).toBe(1);
    const now = await productMetrics(t.ctx, 7);
    expect(now.growth.door.written).toBe(1);
    expect(now.growth.door.booked).toBe(0);
  });

  it('becomes theirs when they join with the address', async () => {
    const thread = await threadOf('Hana Patient');
    const ask = {
      displayName: 'Hana Patient',
      handle: 'hana.patient',
      email: 'hana@example.com',
      password: 'a long enough passphrase',
      birthDate: '1990-03-04',
      country: 'EG',
      timeZone: 'Africa/Cairo',
      locale: 'en-US',
      client: 'native',
    };
    const asked = await t.app.inject({ method: 'POST', url: '/v1/auth/signup', payload: ask });
    expect(asked.json().error.code).toBe('email_code_needed');
    await t.ctx.flush();
    const hana = await signup(t, {
      displayName: ask.displayName,
      handle: ask.handle,
      email: ask.email,
      birthDate: ask.birthDate,
      country: 'EG',
      timeZone: 'Africa/Cairo',
      emailCode: codeFor(ask.email),
    });
    expect(hana.user.kind).toBe('human');
    const inbox = await hana.get('/v1/inbox?view=all');
    expect(inbox.conversations.some((c: any) => c.id === thread.conversationId)).toBe(true);
  });
});
