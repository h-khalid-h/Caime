/**
 * Caime Mail (PRODUCT-REVIEW R75, phase 1): mail to a handle's address becomes a message from a
 * person the mail server vouched for; a stranger's is a request that keeps every message; a
 * thread is a topic; attachments are files; a reply goes out as mail and says how far it got;
 * signing up with the address claims the history; under 18 takes mail from connections only.
 * The provider stands in: a local server answers its API, and its webhooks are posted here.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isReservedHandle, uuidv7 } from '@caime/core';
import type { InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { runDueJobs } from '../src/lib/jobs';
import { STAFF_ADDRESSES } from '../src/lib/mail-in';
import { sweepProvisional } from '../src/lib/mail-out';
import { eraseMessagesWhere } from '../src/lib/org-data';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';
import { BULK_DOMAIN, BULK_IP, mailDns, rawMail, SENDER_IP } from './mail-fixtures';

const DOMAIN = 'caime.test';
const SECRET = 'a-webhook-secret-of-length';

let t: TestApp;
// The codes that prove an address (H1) go out by SMTP, apart from Caime Mail's provider.
const smtp = memoryMailer();
let stub: Server;
let sends: Array<Record<string, unknown>> = [];
let refuseNext = false;
let counter = 0;

/**
 * A mail as Postmark's inbound webhook posts it: the parsed fields and the raw message beside
 * them, which Caime checks itself (mail-auth.ts). `auth` says what the raw message proves: a
 * valid DKIM signature for the From domain ('pass'), one the published key doesn't verify and a
 * connection SPF refuses ('fail'), nothing ('none'), an unsigned mail from an address the From
 * domain's SPF allows ('spf-only'), a bulk sender's own bounce domain ('spf-misaligned'), or a
 * verdict the sender wrote into their own headers ('forged').
 */
async function postmark(m: {
  from: string;
  fromName?: string;
  to: string | string[];
  subject?: string | null;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  auth?: 'pass' | 'fail' | 'none' | 'spf-only' | 'spf-misaligned' | 'forged';
  spam?: boolean;
  attachments?: Array<{ name: string; type: string; content: string }>;
  /** The address it was delivered to when it's in no To or Cc (a Bcc, a list). */
  envelopeTo?: string;
  /** More headers, as a list's mail carries (List-Unsubscribe, Precedence). */
  extraHeaders?: Array<{ Name: string; Value: string }>;
}) {
  counter++;
  const domain = m.from.replace(/^.*@/, '');
  const auth = m.auth ?? 'pass';
  const messageId = m.messageId ?? `<in-${counter}@${domain}>`;
  const headers: Array<{ Name: string; Value: string }> = [
    { Name: 'Message-ID', Value: messageId },
  ];
  if (m.inReplyTo) headers.push({ Name: 'In-Reply-To', Value: m.inReplyTo });
  if (m.references?.length) headers.push({ Name: 'References', Value: m.references.join(' ') });
  if (m.spam) headers.push({ Name: 'X-Spam-Status', Value: 'Yes, score=9.1' });
  headers.push(...(m.extraHeaders ?? []));
  const to = Array.isArray(m.to) ? m.to : [m.to];
  const text = m.text ?? 'Could you send me the contract by Friday?';
  const raw = await rawMail({
    from: m.from,
    fromName: m.fromName,
    to,
    subject: m.subject === undefined ? 'Hello from outside' : m.subject,
    text,
    messageId,
    inReplyTo: m.inReplyTo,
    references: m.references,
    dkim: auth === 'pass' ? 'valid' : auth === 'fail' ? 'wrong-key' : 'none',
    hop:
      auth === 'pass' || auth === 'spf-only'
        ? { ip: SENDER_IP, envelopeFrom: m.from }
        : auth === 'fail'
          ? { ip: BULK_IP, envelopeFrom: m.from }
          : auth === 'spf-misaligned'
            ? { ip: BULK_IP, envelopeFrom: `bounce@${BULK_DOMAIN}` }
            : null,
    senderLines:
      auth === 'forged'
        ? [
            `Authentication-Results: mx.caime.test; dkim=pass header.d=${domain}; spf=pass smtp.mailfrom=${m.from}; dmarc=pass header.from=${domain}`,
          ]
        : [],
  });
  return {
    FromFull: { Email: m.from, Name: m.fromName ?? '' },
    ToFull: to.map((Email) => ({ Email, Name: '' })),
    Subject: m.subject === undefined ? 'Hello from outside' : m.subject,
    MessageID: `pm-in-${counter}`,
    TextBody: text,
    HtmlBody: m.html ?? '',
    Headers: headers,
    Attachments: (m.attachments ?? []).map((a) => ({
      Name: a.name,
      ContentType: a.type,
      Content: Buffer.from(a.content).toString('base64'),
    })),
    RawEmail: raw,
    ...(m.envelopeTo ? { OriginalRecipient: m.envelopeTo } : {}),
  };
}

const inbound = (
  payload: InjectOptions['payload'],
  secret: string | null = SECRET,
  provider = 'postmark',
) =>
  t.app.inject({
    method: 'POST',
    url: `/v1/mail/in/${provider}${secret === null ? '' : `?secret=${secret}`}`,
    payload,
  });

const events = (payload: InjectOptions['payload']) =>
  t.app.inject({ method: 'POST', url: `/v1/mail/events/postmark?secret=${SECRET}`, payload });

/** What was queued runs, as the worker would run it. */
const work = async () => {
  await t.ctx.flush();
  await runDueJobs(t.ctx);
  await t.ctx.flush();
};

const conversationsOf = async (c: Client) =>
  (
    (await c.get('/v1/inbox?view=all')).conversations as Array<{
      id: string;
      section: string;
      title: string;
    }>
  ).map((x) => ({ conversationId: x.id, section: x.section, title: x.title }));

const messagesIn = async (c: Client, id: string) =>
  (await c.get(`/v1/conversations/${id}/messages?limit=50`)).messages as Array<{
    id: string;
    kind: string;
    body: string | null;
    senderId: string | null;
    channel: 'mail' | null;
    mail: {
      direction: 'in' | 'out';
      subject: string | null;
      address: string;
      delivery: string | null;
      hasHtml: boolean;
    } | null;
    files: Array<{ name: string; kind: string }>;
  }>;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}

let noor: Client;
let omar: Client;
let mina: Client;
let orgId: string;

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    if (req.method === 'POST' && req.url === '/email') {
      sends.push({ ...body, token: req.headers['x-postmark-server-token'] });
      if (refuseNext) {
        refuseNext = false;
        res.writeHead(422, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ ErrorCode: 300, Message: 'Invalid email address' }));
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ MessageID: `pm-out-${sends.length}`, ErrorCode: 0 }));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp(
    {
      METRICS_TOKEN: 'test-metrics-token',
      MAIL_DOMAIN: DOMAIN,
      MAIL_PROVIDER: 'postmark',
      MAIL_PROVIDER_TOKEN: 'test-postmark-token',
      MAIL_WEBHOOK_SECRET: SECRET,
      MAIL_BASE_URL: `http://127.0.0.1:${port}`,
      MAIL_STAFF_HANDLE: 'noor.mail',
    },
    { mail: smtp },
  );
  // The internet the mail came through: each sender domain's DKIM key, SPF and DMARC.
  t.ctx.dns = mailDns();
  noor = await signup(t, {
    displayName: 'Noor Mail',
    handle: 'noor.mail',
    email: 'noor.mail@example.com',
  });
  omar = await signup(t, {
    displayName: 'Omar Mail',
    handle: 'omar.mail',
    email: 'omar.mail@example.com',
  });
  mina = await signup(t, {
    displayName: 'Mina Young',
    handle: 'mina.young',
    email: 'mina.young@example.com',
    birthDate: '2012-05-05',
  });
  orgId = (
    await omar.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'business',
    })
  ).org.id;
});

afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('the address', () => {
  it('is the handle at the mail domain for an adult and an organization’s team, and none for a minor', async () => {
    expect((await noor.get('/v1/me')).user.mailAddress).toBe('noor.mail@caime.test');
    expect((await mina.get('/v1/me')).user.mailAddress).toBeNull();
    expect((await omar.get(`/v1/orgs/${orgId}`)).org.mailAddress).toBe('nile.dental@caime.test');
    expect((await noor.get(`/v1/orgs/${orgId}`)).org.mailAddress).toBeNull();
  });

  it('takes the provider’s webhooks only with the secret, by the configured provider’s name', async () => {
    expect(
      (await inbound(await postmark({ from: 'x@example.org', to: 'noor.mail@caime.test' }), null))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await inbound(
          await postmark({ from: 'x@example.org', to: 'noor.mail@caime.test' }),
          'wrong-secret-of-length',
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await inbound(
          await postmark({ from: 'x@example.org', to: 'noor.mail@caime.test' }),
          SECRET,
          'sendgrid',
        )
      ).statusCode,
    ).toBe(404);
    // The password of basic auth in the URL is the secret too (how Postmark carries one).
    const basic = await t.app.inject({
      method: 'POST',
      url: '/v1/mail/in/postmark',
      headers: { authorization: `Basic ${Buffer.from(`caime:${SECRET}`).toString('base64')}` },
      payload: await postmark({ from: 'x@example.org', to: 'nobody.here@caime.test' }),
    });
    expect(basic.statusCode).toBe(200);
    expect(basic.json().outcomes).toEqual([{ to: 'nobody.here@caime.test', outcome: 'unknown' }]);
  });
});

describe('a stranger writes in', () => {
  let sender: string;
  let general: string;

  it('becomes a provisional person, and their mail a message request that keeps every message', async () => {
    const res = await inbound(
      await postmark({
        from: 'sara@partner.example',
        fromName: 'Sara Haddad',
        to: 'noor.mail@caime.test',
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().outcomes).toEqual([{ to: 'noor.mail@caime.test', outcome: 'delivered' }]);
    await t.ctx.flush();
    const row = await t.ctx.db
      .selectFrom('users')
      .select(['id', 'kind', 'handle', 'display_name', 'email'])
      .where('email', '=', 'sara@partner.example')
      .executeTakeFirstOrThrow();
    expect(row.kind).toBe('provisional');
    expect(row.display_name).toBe('Sara Haddad');
    expect(row.handle.startsWith('mail:')).toBe(true);
    sender = row.id;
    const items = await conversationsOf(noor);
    const request = items.find((i) => i.section === 'requests');
    expect(request).toBeDefined();
    general = request?.conversationId ?? '';
    const msgs = await messagesIn(noor, general);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      kind: 'text',
      body: 'Could you send me the contract by Friday?',
      senderId: sender,
      channel: 'mail',
      mail: { direction: 'in', subject: 'Hello from outside', address: 'sara@partner.example' },
    });
    // The person is shown as reached by email, and nobody can find them.
    const convo = await noor.get(`/v1/conversations/${general}`);
    const them = convo.conversation.participants.find(
      (p: { userId: string }) => p.userId === sender,
    );
    expect(them.person.kind).toBe('provisional');
    expect(them.person.trust.label).toBe('Reached by email');
    // What a mail from here would carry: the thread's subject, as an answer.
    expect(convo.conversation.mailSubject).toBe('Re: Hello from outside');
    const found = await omar.get('/v1/people/search?q=Sara');
    expect(JSON.stringify(found)).not.toContain(sender);
    // More mail while the request waits lands in the same conversation, held, not refused.
    const again = await inbound(
      await postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: 'One more thing',
        text: 'And the invoice too.',
      }),
    );
    expect(again.json().outcomes[0].outcome).toBe('delivered');
    await t.ctx.flush();
    expect((await messagesIn(noor, general)).map((m) => m.body)).toEqual([
      'Could you send me the contract by Friday?',
      'And the invoice too.',
    ]);
    // One silent notification for the request, however many mails are held in it.
    const notifications = (await noor.get('/v1/notifications')).notifications as unknown[];
    expect(notifications).toHaveLength(1);
  });

  it('someone reached by email is opened as their mail conversation, never connected with', async () => {
    const opened = await noor.post('/v1/conversations', { kind: 'direct', userId: sender });
    expect(opened.conversation.id).toBe(general);
    const privately = await noor.req('POST', '/v1/conversations', {
      kind: 'direct',
      userId: sender,
      private: true,
    });
    expect(privately.statusCode).toBe(400);
    const asked = await noor.req('POST', '/v1/connections/requests', { toUserId: sender });
    expect(asked.statusCode).toBe(404);
  });

  it('keeps a mail’s HTML as sent, shown to the conversation alone in a sandbox, gone on erasure', async () => {
    const res = await inbound(
      await postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: 'The newsletter',
        text: 'Our news, in plain words.',
        html: '<html><body><h1>Our news</h1><img src="https://track.example/p.gif"><script>alert(1)</script></body></html>',
      }),
    );
    expect(res.json().outcomes[0].outcome).toBe('delivered');
    await t.ctx.flush();
    const msgs = await messagesIn(noor, general);
    const mail = msgs.find((m) => m.body === 'Our news, in plain words.');
    expect(mail?.mail).toMatchObject({ hasHtml: true });
    // A mail without HTML says so.
    expect(msgs.find((m) => m.body === 'And the invoice too.')?.mail).toMatchObject({
      hasHtml: false,
    });
    const url = `/v1/messages/${mail?.id}/mail.html`;
    const shown = await noor.req('GET', url);
    expect(shown.statusCode).toBe(200);
    expect(shown.headers['content-type']).toContain('text/html');
    // No script runs, nothing is fetched, and it has no origin of Caime's.
    const csp = String(shown.headers['content-security-policy']);
    expect(csp).toContain('sandbox');
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('allow-scripts');
    expect(csp).not.toContain('allow-same-origin');
    expect(shown.headers['cache-control']).toContain('no-store');
    expect(shown.body).toContain('<h1>Our news</h1>');
    // Nobody outside the conversation reads it.
    expect((await omar.req('GET', url)).statusCode).toBe(404);
    // Erased, it's gone with the words.
    await eraseMessagesWhere(
      t.ctx.db,
      sql`select id from messages where id = ${mail?.id ?? ''}`,
      new Date(),
    );
    const row = await t.ctx.db
      .selectFrom('mail_messages')
      .select('html')
      .where('message_id', '=', mail?.id ?? '')
      .executeTakeFirstOrThrow();
    expect(row.html).toBeNull();
    expect((await noor.req('GET', url)).statusCode).toBe(404);
  });

  it('delivers the same mail once, however often the provider posts it', async () => {
    const same = await postmark({
      from: 'sara@partner.example',
      to: 'noor.mail@caime.test',
      messageId: '<twice@partner.example>',
      text: 'Twice.',
    });
    expect((await inbound(same)).json().outcomes[0].outcome).toBe('delivered');
    expect((await inbound(same)).json().outcomes[0].outcome).toBe('duplicate');
    await t.ctx.flush();
    expect((await messagesIn(noor, general)).filter((m) => m.body === 'Twice.')).toHaveLength(1);
  });

  it('a reply accepts the request and goes out as mail from her address, in the thread, and says how far it got', async () => {
    sends = [];
    const sent = await noor.post(`/v1/conversations/${general}/messages`, {
      clientId: 'noor-reply-1',
      kind: 'text',
      body: 'Of course. It’s attached to my next message.',
    });
    await work();
    expect(sends).toHaveLength(1);
    const out = sends[0] as Record<string, unknown>;
    expect(out.From).toBe('Noor Mail <noor.mail@caime.test>');
    expect(out.To).toBe('sara@partner.example');
    expect(out.Subject).toBe('Re: Hello from outside');
    // The words, then a link back to Caime, and that its sender is told when it's opened (R75).
    const textBody = String(out.TextBody);
    expect(textBody.startsWith('Of course. It’s attached to my next message.\n\n--\n')).toBe(true);
    expect(textBody).toMatch(
      /Open in Caime: http:\/\/localhost:8787\/v1\/mail\/seen\/[0-9a-f-]{36}\.[\w-]{22}/,
    );
    expect(textBody).toContain('Noor Mail is told when this mail is opened.');
    expect(out.TrackOpens).toBe(true);
    expect(String(out.HtmlBody)).toContain('Of course. It’s attached to my next message.');
    expect(out.token).toBe('test-postmark-token');
    const headers = out.Headers as Array<{ Name: string; Value: string }>;
    const header = (name: string) => headers.find((h) => h.Name === name)?.Value;
    expect(header('In-Reply-To')).toBe('<twice@partner.example>');
    expect(header('Message-ID')).toMatch(new RegExp(`^<[0-9a-f-]+@${DOMAIN}>$`));
    // The mail replied to started its own thread: the chain is that one id.
    expect(header('References')).toBe('<twice@partner.example>');
    const mine = (await messagesIn(noor, general)).find((m) => m.id === sent.message.id);
    expect(mine?.channel).toBe('mail');
    expect(mine?.mail).toMatchObject({
      direction: 'out',
      address: 'sara@partner.example',
      delivery: 'sent',
    });
    // The request is accepted by the reply: no longer under Requests.
    expect(
      (await conversationsOf(noor)).find((i) => i.conversationId === general)?.section,
    ).not.toBe('requests');
    // The provider says delivered, then bounced; the message says so, and never goes back.
    expect(
      (
        await events([
          { RecordType: 'Delivery', MessageID: 'pm-out-1', DeliveredAt: '2026-09-23T14:01:00Z' },
        ])
      ).json().applied,
    ).toBe(1);
    expect(
      (await messagesIn(noor, general)).find((m) => m.id === sent.message.id)?.mail?.delivery,
    ).toBe('delivered');
    expect(
      (
        await events([
          {
            RecordType: 'Bounce',
            MessageID: 'pm-out-1',
            Type: 'HardBounce',
            Description: 'The address does not exist.',
          },
        ])
      ).json().applied,
    ).toBe(0);
    expect(
      (await events([{ RecordType: 'Delivery', MessageID: 'pm-out-unknown' }])).json().applied,
    ).toBe(0);
  });

  it('threads are topics: a new subject starts one, a referenced mail lands in it, and the same subject finds it', async () => {
    const first = await inbound(
      await postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: 'Venue for March',
        text: 'Shall we book the hall?',
      }),
    );
    expect(first.json().outcomes[0].outcome).toBe('delivered');
    await t.ctx.flush();
    const topic = (await conversationsOf(noor)).find((i) => i.title === 'Venue for March');
    expect(topic).toBeDefined();
    expect(topic?.conversationId).not.toBe(general);
    const topicMsgs = await messagesIn(noor, topic?.conversationId ?? '');
    expect(topicMsgs.map((m) => m.body)).toEqual(['Shall we book the hall?']);
    // Her answer goes out in the thread, with the topic's name as its subject.
    sends = [];
    await noor.post(`/v1/conversations/${topic?.conversationId}/messages`, {
      clientId: 'noor-topic-1',
      kind: 'text',
      body: 'Yes, book it.',
    });
    await work();
    expect(sends[0]?.Subject).toBe('Re: Venue for March');
    const outHeaders = (sends[0]?.Headers ?? []) as Array<{ Name: string; Value: string }>;
    const ourId = outHeaders.find((h) => h.Name === 'Message-ID')?.Value ?? '';
    // Their reply references our id: the same topic, whatever its subject reads.
    await inbound(
      await postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: 'RE: Re: Venue for March',
        text: 'Done.',
        inReplyTo: ourId,
        references: [ourId],
      }),
    );
    await t.ctx.flush();
    expect((await messagesIn(noor, topic?.conversationId ?? '')).map((m) => m.body)).toEqual([
      'Shall we book the hall?',
      'Yes, book it.',
      'Done.',
    ]);
    // A mail with the same subject and no references finds the topic too; one with none at all stays in the general conversation.
    await inbound(
      await postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: 'Fwd: Venue for March',
        text: 'Forwarding the quote.',
      }),
    );
    await inbound(
      await postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: null,
        text: 'No subject here.',
      }),
    );
    await t.ctx.flush();
    expect((await messagesIn(noor, topic?.conversationId ?? '')).map((m) => m.body)).toContain(
      'Forwarding the quote.',
    );
    expect((await messagesIn(noor, general)).map((m) => m.body)).toContain('No subject here.');
  });

  it('attachments are the sender’s files on the message, and a long mail rides along whole as a file', async () => {
    await inbound(
      await postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: 'The quote',
        text: 'Attached.',
        attachments: [{ name: 'quote.txt', type: 'text/plain', content: 'Hall: 1,200 EGP' }],
      }),
    );
    const long = `${'word '.repeat(2_500)}end`;
    await inbound(
      await postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: 'Minutes',
        text: long,
      }),
    );
    await t.ctx.flush();
    const quote = (await conversationsOf(noor)).find((i) => i.title === 'The quote');
    const withFile = (await messagesIn(noor, quote?.conversationId ?? '')).find(
      (m) => m.body === 'Attached.',
    );
    expect(withFile?.kind).toBe('file');
    expect(withFile?.files.map((f) => f.name)).toEqual(['quote.txt']);
    const minutes = (await conversationsOf(noor)).find((i) => i.title === 'Minutes');
    const cut = (await messagesIn(noor, minutes?.conversationId ?? ''))[0];
    expect(cut?.body?.length).toBe(10_000);
    expect(cut?.body?.endsWith('…')).toBe(true);
    expect(cut?.files.map((f) => f.name)).toEqual(['Minutes.txt']);
  });

  it('a provider’s refusal is said on the message as a bounce, not retried', async () => {
    sends = [];
    refuseNext = true;
    const sent = await noor.post(`/v1/conversations/${general}/messages`, {
      clientId: 'noor-refused',
      kind: 'text',
      body: 'Still there?',
    });
    await work();
    expect(sends).toHaveLength(1);
    expect(
      (await messagesIn(noor, general)).find((m) => m.id === sent.message.id)?.mail,
    ).toMatchObject({ direction: 'out', delivery: 'bounced' });
    const jobs = await t.ctx.db
      .selectFrom('jobs')
      .select(['attempts', 'done_at'])
      .where('kind', '=', 'mail.send')
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    expect(jobs.done_at).not.toBeNull();
  });

  it('signing up with the address claims the person once the address is proven: the same row, the history theirs', async () => {
    const ask = {
      email: 'sara@partner.example',
      password: 'correct horse battery',
      displayName: 'Sara Haddad',
      handle: 'sara.haddad',
      birthDate: '1990-01-01',
      country: 'EG',
      timeZone: 'Africa/Cairo',
      locale: 'en-US',
      client: 'native',
    };
    // Whoever types the address is asked for the code sent to it (review 2026-10-17 §2 H1):
    // nothing is claimed, nobody signed in, until it comes back.
    const asked = await t.app.inject({ method: 'POST', url: '/v1/auth/signup', payload: ask });
    expect(asked.statusCode).toBe(409);
    expect(asked.json().error.code).toBe('email_code_needed');
    await t.ctx.flush();
    const code = /^(\d{6}) /.exec(
      smtp.outbox.filter((m) => m.to === ask.email).at(-1)?.subject ?? '',
    )?.[1];
    expect(code).toMatch(/^\d{6}$/);
    const stillProvisional = await t.ctx.db
      .selectFrom('users')
      .select('kind')
      .where('id', '=', sender)
      .executeTakeFirstOrThrow();
    expect(stillProvisional.kind).toBe('provisional');
    const wrong = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...ask, emailCode: code === '000000' ? '111111' : '000000' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('wrong_code');
    const sara = await signup(t, {
      displayName: 'Sara Haddad',
      handle: 'sara.haddad',
      email: 'sara@partner.example',
      emailCode: code as string,
    });
    expect(sara.user.id).toBe(sender);
    // Proven by the code: confirmed, and when it was claimed kept.
    const claimed = await t.ctx.db
      .selectFrom('users')
      .select(['email_verified_at', 'claimed_at'])
      .where('id', '=', sender)
      .executeTakeFirstOrThrow();
    expect(claimed.email_verified_at).not.toBeNull();
    expect(claimed.claimed_at).not.toBeNull();
    expect(sara.user.kind).toBe('human');
    expect(sara.user.handle).toBe('sara.haddad');
    expect(sara.user.mailAddress).toBe('sara.haddad@caime.test');
    const theirs = await conversationsOf(sara);
    expect(theirs.some((i) => i.conversationId === general)).toBe(true);
    expect(
      (await messagesIn(sara, general)).some(
        (m) => m.body === 'Could you send me the contract by Friday?',
      ),
    ).toBe(true);
    // Now a person on Caime: a reply stays on Caime, nothing goes out as mail.
    sends = [];
    await noor.post(`/v1/conversations/${general}/messages`, {
      clientId: 'noor-after-claim',
      kind: 'text',
      body: 'Welcome to Caime.',
    });
    await work();
    expect(sends).toHaveLength(0);
    // Signing up with a taken address is still refused.
    const again = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'sara@partner.example',
        password: 'correct horse battery',
        displayName: 'Sara',
        handle: 'sara.again',
        birthDate: '1990-01-01',
        country: 'EG',
        timeZone: 'Africa/Cairo',
        locale: 'en-US',
        client: 'native',
      },
    });
    expect(again.statusCode).toBe(409);
  });
});

describe('who may write in, and to whom', () => {
  it('takes the staff addresses to whoever the operator named, a Bcc to its handle, and nothing else reserved', async () => {
    const before = (await conversationsOf(noor)).length;
    const res = await inbound(
      await postmark({
        from: 'reports@isp.example',
        to: 'abuse@caime.test',
        subject: 'Abuse report',
        text: 'A message from one of your addresses looks like phishing.',
      }),
    );
    expect(res.json().outcomes).toEqual([{ to: 'abuse@caime.test', outcome: 'delivered' }]);
    await work();
    expect((await conversationsOf(noor)).length).toBe(before + 1);
    // Every staff address is a reserved handle, so nobody else can hold one.
    for (const address of STAFF_ADDRESSES) expect(isReservedHandle(address)).toBe(true);
    // Addresses that land in one place take the mail once.
    const many = await inbound(
      await postmark({
        from: 'press@paper.example',
        to: ['support@caime.test', 'hello@caime.test', 'noor.mail@caime.test'],
        subject: 'An interview',
      }),
    );
    expect(many.json().outcomes).toEqual([
      { to: 'support@caime.test', outcome: 'delivered' },
      { to: 'hello@caime.test', outcome: 'duplicate' },
      { to: 'noor.mail@caime.test', outcome: 'duplicate' },
    ]);
    await work();
    const kept = await t.ctx.db
      .selectFrom('mail_messages')
      .select('to_address')
      .where('from_address', '=', 'press@paper.example')
      .execute();
    expect(kept).toEqual([{ to_address: 'support@caime.test' }]);
    // A Bcc (or a list) reaches the handle it was delivered to, which no To or Cc names.
    const bcc = await inbound(
      await postmark({
        from: 'friend@partner.example',
        to: 'everyone@lists.example',
        envelopeTo: 'noor.mail@caime.test',
      }),
    );
    expect(bcc.json().outcomes).toEqual([{ to: 'noor.mail@caime.test', outcome: 'delivered' }]);
    // A reserved name that isn't a staff address still reaches nobody.
    expect(
      (await inbound(await postmark({ from: 'x@example.org', to: 'admin@caime.test' }))).json()
        .outcomes[0].outcome,
    ).toBe('unknown');
  });

  it('takes mail the server didn’t vouch for as nobody’s, drops spam and mail to nobody, and counts each', async () => {
    const before = (await conversationsOf(noor)).length;
    // Each kept as a notice that says so (M16 F1), never as the address's own person's.
    expect(
      (
        await inbound(
          await postmark({ from: 'spoof@bank.example', to: 'noor.mail@caime.test', auth: 'fail' }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('kept_unverified');
    expect(
      (
        await inbound(
          await postmark({ from: 'anon@bank.example', to: 'noor.mail@caime.test', auth: 'none' }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('kept_unverified');
    expect(
      (
        await inbound(
          await postmark({
            from: 'news@bank.example',
            to: 'noor.mail@caime.test',
            auth: 'spf-misaligned',
          }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('kept_unverified');
    // A verdict the sender wrote into their own headers is theirs, not a server's.
    expect(
      (
        await inbound(
          await postmark({ from: 'ceo@bank.example', to: 'noor.mail@caime.test', auth: 'forged' }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('kept_unverified');
    expect(
      (
        await inbound(
          await postmark({ from: 'junk@spam.example', to: 'noor.mail@caime.test', spam: true }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('spam');
    expect(
      (await inbound(await postmark({ from: 'x@example.org', to: 'cai@caime.test' }))).json()
        .outcomes[0].outcome,
    ).toBe('unknown');
    expect(
      (await inbound(await postmark({ from: 'x@example.org', to: 'x@elsewhere.example' }))).json()
        .outcomes,
    ).toEqual([]);
    expect(
      (
        await inbound(
          await postmark({
            from: 'x@example.org',
            to: 'noor.mail@caime.test',
            text: '',
            subject: null,
          }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('empty');
    await t.ctx.flush();
    // One notice for each address claimed, and nobody made for any of them.
    expect((await conversationsOf(noor)).length).toBe(before + 4);
    expect(
      await t.ctx.db
        .selectFrom('users')
        .select('id')
        .where('email', 'in', [
          'spoof@bank.example',
          'anon@bank.example',
          'ceo@bank.example',
          'junk@spam.example',
        ])
        .execute(),
    ).toHaveLength(0);
    // SPF for the address Postmark saw connect, aligned with the From domain, is enough unsigned.
    expect(
      (
        await inbound(
          await postmark({
            from: 'plain@small-host.example',
            to: 'noor.mail@caime.test',
            auth: 'spf-only',
          }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('delivered');
    const metrics = await t.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer test-metrics-token' },
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('caime_mail_total{direction="in",outcome="kept_unverified"} 4');
    expect(metrics.body).toContain('caime_mail_total{direction="in",outcome="spam"} 1');
  });

  it('under 18, an address takes mail from people they’re connected with and nobody else, without a bounce', async () => {
    const stranger = await inbound(
      await postmark({ from: 'anyone@partner.example', to: 'mina.young@caime.test' }),
    );
    expect(stranger.json().outcomes[0].outcome).toBe('refused');
    // A minor takes requests from nobody they don't know (R29): Mina asks Omar.
    const withOmar = await connect(mina, omar);
    const known = await inbound(
      await postmark({
        from: 'omar.mail@example.com',
        to: 'mina.young@caime.test',
        subject: null,
        text: 'From my mail client.',
      }),
    );
    expect(known.json().outcomes[0].outcome).toBe('delivered');
    await t.ctx.flush();
    const msgs = await messagesIn(mina, withOmar);
    expect(msgs.find((m) => m.body === 'From my mail client.')).toMatchObject({
      senderId: omar.user.id,
      channel: 'mail',
    });
  });

  it('a person with an account who mails from their own address is that person, and blocks hold', async () => {
    const convo = await connect(noor, omar);
    const res = await inbound(
      await postmark({
        from: 'omar.mail@example.com',
        to: 'noor.mail@caime.test',
        subject: null,
        text: 'Sent from the train.',
      }),
    );
    expect(res.json().outcomes[0].outcome).toBe('delivered');
    await t.ctx.flush();
    expect(
      (await messagesIn(noor, convo)).find((m) => m.body === 'Sent from the train.'),
    ).toMatchObject({ senderId: omar.user.id, channel: 'mail' });
    await noor.post('/v1/blocks', { userId: omar.user.id });
    expect(
      (
        await inbound(
          await postmark({
            from: 'omar.mail@example.com',
            to: 'noor.mail@caime.test',
            text: 'Blocked.',
          }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('refused');
    await noor.req('DELETE', `/v1/blocks/${omar.user.id}`);
  });

  it('an address someone proved theirs is that person, and their own mail lands with Cai, unanswered (R91)', async () => {
    await t.ctx.db
      .insertInto('own_addresses')
      .values({
        id: uuidv7(),
        user_id: omar.user.id,
        kind: 'email',
        value: 'omar@second-address.example',
        method: 'email',
        verified_at: t.ctx.now(),
        created_at: t.ctx.now(),
      })
      .execute();
    // Connected in the case before, unless this one runs alone.
    const convo =
      (await conversationsOf(noor)).find((c) => c.title === 'Omar Mail')?.conversationId ??
      (await connect(noor, omar));
    const res = await inbound(
      await postmark({
        from: 'omar@second-address.example',
        to: 'noor.mail@caime.test',
        subject: null,
        text: 'From my other address.',
      }),
    );
    expect(res.json().outcomes[0].outcome).toBe('delivered');
    await t.ctx.flush();
    expect(
      (await messagesIn(noor, convo)).find((m) => m.body === 'From my other address.'),
    ).toMatchObject({ senderId: omar.user.id, channel: 'mail' });

    // Omar forwards a mail to his own Caime address: it's kept in his chat with Cai.
    const self = await inbound(
      await postmark({
        from: 'omar@second-address.example',
        to: 'omar.mail@caime.test',
        subject: 'Fwd: the lease',
        text: 'Keep this for me.',
      }),
    );
    expect(self.json().outcomes[0].outcome).toBe('delivered');
    await work();
    const cai = (await conversationsOf(omar)).find((c) => c.title === 'Cai');
    expect(cai).toBeDefined();
    const withCai = await messagesIn(omar, cai?.conversationId ?? '');
    const kept = withCai.find((m) => m.body === 'Keep this for me.');
    expect(kept).toMatchObject({ senderId: omar.user.id, channel: 'mail' });
    // Kept, not answered: nothing from Cai after it.
    const after = withCai.slice(withCai.indexOf(kept as (typeof withCai)[number]) + 1);
    expect(after.filter((m) => m.senderId !== omar.user.id)).toEqual([]);
    // And nothing went out as mail to anyone.
    expect(sends.filter((s) => JSON.stringify(s).includes('Keep this for me.'))).toEqual([]);
  });

  it('mail to an organization’s address is a customer thread in its inbox, answered as the organization', async () => {
    const res = await inbound(
      await postmark({
        from: 'patient@clinic-customer.example',
        fromName: 'Hana',
        to: 'nile.dental@caime.test',
        subject: 'Appointment',
        text: 'Do you have a slot on Tuesday?',
      }),
    );
    expect(res.json().outcomes[0].outcome).toBe('delivered');
    await t.ctx.flush();
    type Thread = { conversationId: string; customer: { displayName: string } | null };
    const inbox = [
      ...((await omar.get(`/v1/orgs/${orgId}/inbox?view=customer_waiting`)).threads as Thread[]),
      ...((await omar.get(`/v1/orgs/${orgId}/inbox?view=new`)).threads as Thread[]),
    ];
    const thread = inbox.find((x) => x.customer?.displayName === 'Hana');
    expect(thread).toBeDefined();
    sends = [];
    await omar.post(`/v1/conversations/${thread?.conversationId}/messages`, {
      clientId: 'omar-org-reply',
      kind: 'text',
      body: 'Tuesday at 10 is free.',
    });
    await work();
    expect(sends).toHaveLength(1);
    expect(sends[0]?.From).toBe('Nile Dental <nile.dental@caime.test>');
    expect(sends[0]?.To).toBe('patient@clinic-customer.example');
    expect(sends[0]?.Subject).toBe('Re: Appointment');
  });

  it('a list’s mail is a notice: never a request, muted, nobody told, never answered (R75)', async () => {
    const before = (await noor.get('/v1/notifications')).notifications.length;
    const res = await inbound(
      await postmark({
        from: 'news@shop-letters.example',
        fromName: 'Shop Letters',
        to: 'noor.mail@caime.test',
        subject: 'This week’s offers',
        text: 'Could you check our new arrivals by Friday?',
        extraHeaders: [
          { Name: 'List-Unsubscribe', Value: '<mailto:unsubscribe@shop-letters.example>' },
        ],
      }),
    );
    expect(res.json().outcomes[0].outcome).toBe('delivered');
    await work();
    const inbox = (await noor.get('/v1/inbox?view=all')).conversations as Array<{
      id: string;
      section: string;
      title: string;
    }>;
    const notice = inbox.find((c) => c.title === 'Shop Letters');
    expect(notice?.section).toBe('notices');
    // Nothing asked of Noor, and nobody told.
    expect((await noor.get('/v1/notifications')).notifications.length).toBe(before);
    const view = await noor.get(`/v1/conversations/${notice?.id}`);
    expect(view.conversation.notice).toBe(true);
    const answered = await noor.req('POST', `/v1/conversations/${notice?.id}/messages`, {
      clientId: 'noor-to-a-list',
      kind: 'text',
      body: 'Unsubscribe me',
    });
    expect(answered.statusCode).toBe(409);
    expect(answered.json().error.code).toBe('notice_only');
    // The next one from the same list lands in the same place.
    await inbound(
      await postmark({
        from: 'news@shop-letters.example',
        fromName: 'Shop Letters',
        to: 'noor.mail@caime.test',
        subject: 'Next week',
        text: 'More offers.',
        extraHeaders: [{ Name: 'Precedence', Value: 'bulk' }],
      }),
    );
    await work();
    const messages = (await noor.get(`/v1/conversations/${notice?.id}/messages`)).messages;
    expect(messages.map((m: { body: string }) => m.body)).toEqual([
      'Could you check our new arrivals by Friday?',
      'More offers.',
    ]);
  });

  it('writing to an address that isn’t on Caime: one mail, saying who wrote, until they answer (R93)', async () => {
    const open = await noor.req('POST', '/v1/conversations/by-email', {
      email: 'Layla@Outside.example',
      name: 'Layla',
    });
    expect(open.statusCode).toBe(201);
    const convo = open.json().conversation.id as string;
    // The same address again is the same conversation.
    const again = await noor.post('/v1/conversations/by-email', { email: 'layla@outside.example' });
    expect(again.conversation.id).toBe(convo);

    sends = [];
    await noor.post(`/v1/conversations/${convo}/messages`, {
      clientId: 'noor-to-layla-1',
      kind: 'text',
      body: 'Hi Layla, are we still on for the shoot next week?',
    });
    await work();
    expect(sends).toHaveLength(1);
    expect(sends[0]?.From).toBe('Noor Mail <noor.mail@caime.test>');
    expect(sends[0]?.To).toBe('layla@outside.example');
    expect(String(sends[0]?.TextBody)).toContain(
      'Noor Mail wrote this on Caime, from noor.mail@caime.test. Reply to this mail to answer',
    );
    // A message request: nothing more until she answers.
    const more = await noor.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: 'noor-to-layla-2',
      kind: 'text',
      body: 'Hello?',
    });
    expect(more.json().error.code).toBe('awaiting_acceptance');

    // She answers from her mail: it lands in the same conversation, and Noor writes freely.
    const outHeaders = (sends[0]?.Headers ?? []) as Array<{ Name: string; Value: string }>;
    const outId = outHeaders.find((h) => h.Name === 'Message-ID')?.Value ?? '';
    const reply = await inbound(
      await postmark({
        from: 'layla@outside.example',
        fromName: 'Layla',
        to: 'noor.mail@caime.test',
        subject: `Re: ${String(sends[0]?.Subject)}`,
        text: 'Yes, Thursday works.',
        inReplyTo: outId,
        references: [outId],
      }),
    );
    expect(reply.json().outcomes[0].outcome).toBe('delivered');
    await t.ctx.flush();
    expect(
      (await messagesIn(noor, convo)).find((m) => m.body === 'Yes, Thursday works.'),
    ).toBeTruthy();
    sends = [];
    await noor.post(`/v1/conversations/${convo}/messages`, {
      clientId: 'noor-to-layla-3',
      kind: 'text',
      body: 'Great, see you then.',
    });
    await work();
    expect(sends).toHaveLength(1);
    // Only the first mail of a conversation says who wrote; every one links back to Caime.
    const later = String(sends[0]?.TextBody);
    expect(later.startsWith('Great, see you then.\n\n--\nOpen in Caime: ')).toBe(true);
    expect(later).not.toContain('wrote this on Caime');
  });

  it('never mails someone on Caime behind them, nor writes to one’s own or a Caime address (R93)', async () => {
    // Counted against the day before anything is said of it (review 2026-10-17 §2 H2), and the
    // answer names nobody.
    const hit = vi.spyOn(t.ctx.limiter, 'hit');
    const taken = await noor.req('POST', '/v1/conversations/by-email', {
      email: 'omar.mail@example.com',
    });
    expect(hit.mock.calls.some(([key]) => key === `mail-start:${noor.user.id}`)).toBe(true);
    hit.mockRestore();
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('email_taken');
    expect(JSON.stringify(taken.json())).not.toContain('Omar');
    const own = await noor.req('POST', '/v1/conversations/by-email', {
      email: 'noor.mail@example.com',
    });
    expect(own.statusCode).toBe(400);
    const caime = await noor.req('POST', '/v1/conversations/by-email', {
      email: 'someone@caime.test',
    });
    expect(caime.statusCode).toBe(400);
    const young = await mina.req('POST', '/v1/conversations/by-email', {
      email: 'friend@outside.example',
    });
    expect(young.statusCode).toBe(403);
  });

  it('a provisional person silent for a year goes; their words stay', async () => {
    const before = await t.ctx.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'patient@clinic-customer.example')
      .executeTakeFirstOrThrow();
    await sweepProvisional(t.ctx);
    expect(
      await t.ctx.db
        .selectFrom('users')
        .select('id')
        .where('id', '=', before.id)
        .executeTakeFirst(),
    ).toBeDefined();
    t.clock.advance(370 * 24 * 3_600_000);
    await sweepProvisional(t.ctx);
    expect(
      await t.ctx.db
        .selectFrom('users')
        .select('id')
        .where('id', '=', before.id)
        .executeTakeFirst(),
    ).toBeUndefined();
    const words = await t.ctx.db
      .selectFrom('messages')
      .select(['body', 'sender_id'])
      .where('body', '=', 'Do you have a slot on Tuesday?')
      .executeTakeFirstOrThrow();
    expect(words.sender_id).toBeNull();
  });
});

describe('how far a mail got, and words that read as chat (R75)', () => {
  const lina = 'lina@studio.example';
  const linaMail = (m: { text: string; html?: string; inReplyTo?: string; subject?: string }) =>
    postmark({ from: lina, fromName: 'Lina Studio', to: 'rami.mail@caime.test', ...m });
  const SIGNED =
    '<div dir="ltr">{words}<br><br><div class="gmail_signature"><div dir="ltr"><b>Lina Saad</b><br>Studio <b>Lina</b></div></div></div>';

  // A person of their own: the test before this one moved the clock a year on.
  let rami: Client;
  beforeAll(async () => {
    rami = await signup(t, {
      displayName: 'Rami Mail',
      handle: 'rami.mail',
      email: 'rami.mail@example.com',
    });
  });

  it('sets a signature apart, says seen when they reply or follow the link, opened by the pixel, and asks nothing of whoever turned that off', async () => {
    // Lina writes; her Gmail signature comes apart from her words, without its asterisks.
    expect(
      (
        await inbound(
          await linaMail({
            subject: 'The posters',
            text: 'Are the posters ready?\n\n*Lina Saad*\nStudio *Lina*',
            html: SIGNED.replace('{words}', 'Are the posters ready?'),
          }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('delivered');
    await t.ctx.flush();
    const request = (await conversationsOf(rami)).find((i) => i.section === 'requests');
    const convo = request?.conversationId ?? '';
    const first = (await messagesIn(rami, convo))[0] as unknown as {
      body: string;
      mail: { signature: string | null };
    };
    expect(first.body).toBe('Are the posters ready?');
    expect(first.mail.signature).toBe('Lina Saad\nStudio Lina');
    // Omar answers by mail; the provider says it was opened (its pixel): opened, probably.
    sends = [];
    const answer = await rami.post(`/v1/conversations/${convo}/messages`, {
      clientId: 'rami-posters-1',
      kind: 'text',
      body: 'Tomorrow morning.',
    });
    await work();
    expect(sends).toHaveLength(1);
    const ours = (sends[0] as { Headers: Array<{ Name: string; Value: string }> }).Headers.find(
      (h) => h.Name === 'Message-ID',
    )?.Value;
    await t.ctx.db
      .updateTable('mail_messages')
      .set({ provider_id: 'pm-posters-1' })
      .where('message_id', '=', answer.message.id)
      .execute();
    expect(
      (
        await events([
          { RecordType: 'Open', MessageID: 'pm-posters-1', ReceivedAt: '2026-10-15T08:00:00Z' },
        ])
      ).json().applied,
    ).toBe(1);
    const mailOf = async (id: string) =>
      ((await messagesIn(rami, convo)).find((m) => m.id === id)?.mail ?? null) as {
        openedAt: string | null;
        seenAt: string | null;
      } | null;
    expect((await mailOf(answer.message.id))?.openedAt).toBe('2026-10-15T08:00:00.000Z');
    expect((await mailOf(answer.message.id))?.seenAt).toBeNull();
    // She replies: what Omar mailed her before is seen. Her signature is known from her last.
    expect(
      (
        await inbound(
          await linaMail({
            subject: 'Re: The posters',
            text: 'Perfect, thanks!\n\nLina Saad\nStudio Lina',
            inReplyTo: ours,
          }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('delivered');
    await t.ctx.flush();
    expect((await mailOf(answer.message.id))?.seenAt).not.toBeNull();
    const reply = (await messagesIn(rami, convo)).find((m) => m.body === 'Perfect, thanks!') as
      | { mail: { signature: string | null } }
      | undefined;
    expect(reply?.mail.signature).toBe('Lina Saad\nStudio Lina');
    // Omar turns opens off: his next mail carries no pixel and says nothing of it, but still
    // links back; following the link says seen and lands on signing up.
    await rami.patch('/v1/me', { preferences: { mailOpens: false } });
    sends = [];
    const next = await rami.post(`/v1/conversations/${convo}/messages`, {
      clientId: 'rami-posters-2',
      kind: 'text',
      body: 'They are at the front desk.',
    });
    await work();
    expect(sends).toHaveLength(1);
    const plain = sends[0] as Record<string, unknown>;
    expect(plain.TrackOpens).toBeUndefined();
    expect(plain.HtmlBody).toBeUndefined();
    expect(String(plain.TextBody)).not.toContain('is told when this mail is opened');
    const link = /\/v1\/mail\/seen\/\S+/.exec(String(plain.TextBody))?.[0] ?? '';
    expect(link).not.toBe('');
    // A link Caime didn't write changes nothing, and lands in the same place.
    const forged = await t.app.inject({ method: 'GET', url: `${link.slice(0, -3)}AAA` });
    expect(forged.statusCode).toBe(302);
    expect((await mailOf(next.message.id))?.seenAt).toBeNull();
    const followed = await t.app.inject({ method: 'GET', url: link });
    expect(followed.statusCode).toBe(302);
    expect(followed.headers.location).toBe('http://localhost:8787/sign-up');
    expect((await mailOf(next.message.id))?.seenAt).not.toBeNull();
  });
});

describe('mail its sender couldn’t be confirmed for (M16 F1)', () => {
  let lena: Client;
  beforeAll(async () => {
    lena = await signup(t, {
      displayName: 'Lena Mail',
      handle: 'lena.mail',
      email: 'lena.mail@example.com',
    });
  });

  it('is kept as a notice that says so, named by the address alone, never answered and read for nothing', async () => {
    const before = await conversationsOf(lena);
    const told = (await lena.get('/v1/notifications')).notifications.length;
    const first = await inbound(
      await postmark({
        from: 'billing@bank.example',
        fromName: 'Your Bank',
        to: 'lena.mail@caime.test',
        auth: 'fail',
        subject: 'Invoice overdue',
        text: 'I’ll send the contract by Friday. Could you pay the invoice today?',
      }),
    );
    expect(first.json().outcomes).toEqual([
      { to: 'lena.mail@caime.test', outcome: 'kept_unverified' },
    ]);
    await work();
    const after = await conversationsOf(lena);
    expect(after).toHaveLength(before.length + 1);
    const notice = after.find((c) => !before.some((b) => b.conversationId === c.conversationId));
    // Under Notices, named by the address it claimed, never the name it gave.
    expect(notice).toMatchObject({ section: 'notices', title: 'billing@bank.example' });
    const id = notice?.conversationId as string;
    const view = (await lena.get(`/v1/conversations/${id}`)).conversation;
    expect(view).toMatchObject({ notice: true, unverifiedSender: 'billing@bank.example' });
    // Whoever it stands for, its profile says only what Caime knows: nobody anyone vouched for.
    const standIn = (view as { other: { userId: string } }).other.userId;
    expect((await lena.get(`/v1/people/${standIn}`)).person.trust).toMatchObject({
      label: 'Sender not confirmed',
      unverifiedSender: true,
    });
    const [m] = await messagesIn(lena, id);
    expect(m?.mail).toMatchObject({
      direction: 'in',
      address: 'billing@bank.example',
      unverified: true,
    });
    // Nobody told, nothing asked of anyone, and nothing goes back.
    expect((await lena.get('/v1/notifications')).notifications.length).toBe(told);
    expect(
      await t.ctx.db
        .selectFrom('suggestions')
        .select('id')
        .where('user_id', '=', lena.user.id)
        .execute(),
    ).toHaveLength(0);
    const answered = await lena.req('POST', `/v1/conversations/${id}/messages`, {
      clientId: uuidv7(),
      kind: 'text',
      body: 'Paid.',
    });
    expect(answered.statusCode).toBe(409);
    expect(answered.json().error.code).toBe('notice_only');
    // Whoever holds that address isn't who wrote this: nobody was made for it.
    expect(
      await t.ctx.db
        .selectFrom('users')
        .select('id')
        .where('email', '=', 'billing@bank.example')
        .execute(),
    ).toHaveLength(0);
    // The next one claiming the same address lands in the same notice.
    expect(
      (
        await inbound(
          await postmark({
            from: 'billing@bank.example',
            to: 'lena.mail@caime.test',
            auth: 'none',
            text: 'Second notice.',
          }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('kept_unverified');
    await work();
    expect(await messagesIn(lena, id)).toHaveLength(2);
    expect(await conversationsOf(lena)).toHaveLength(before.length + 1);
    // Mail its server vouches for, from that address, is the address's own person, elsewhere.
    expect(
      (
        await inbound(
          await postmark({
            from: 'billing@bank.example',
            to: 'lena.mail@caime.test',
            text: 'The real one.',
          }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('delivered');
    await work();
    const real = (await conversationsOf(lena)).filter(
      (c) => c.conversationId !== id && !before.some((b) => b.conversationId === c.conversationId),
    );
    expect(real).toHaveLength(1);
    expect(real[0]?.section).not.toBe('notices');
    expect((await messagesIn(lena, real[0]?.conversationId as string))[0]?.mail).toMatchObject({
      unverified: false,
    });
  });

  it('teaches nothing of the real sender: a signature it came with folds none of theirs', async () => {
    await inbound(
      await postmark({
        from: 'sam@bank.example',
        to: 'lena.mail@caime.test',
        auth: 'fail',
        text: 'Please wire it today.\n\n-- \nSam Teller\nACME Bank',
      }),
    );
    await inbound(
      await postmark({
        from: 'sam@bank.example',
        to: 'lena.mail@caime.test',
        text: 'Here are the minutes.\n\nSam Teller\nACME Bank',
      }),
    );
    await work();
    const rows = await t.ctx.db
      .selectFrom('mail_messages')
      .select(['unverified', 'signature'])
      .where('from_address', '=', 'sam@bank.example')
      .orderBy('created_at')
      .execute();
    expect(rows).toEqual([
      { unverified: true, signature: 'Sam Teller\nACME Bank' },
      // Read whole: a signature nobody confirmed is no sign of how this sender ends a mail.
      { unverified: false, signature: null },
    ]);
  });

  it('is refused where its domain asks, at an organization’s address and Cai’s, and under 18', async () => {
    t.ctx.dns = mailDns({
      'strict.example': 'v=DMARC1; p=reject',
      'careful.example': 'v=DMARC1; p=quarantine',
    });
    try {
      const before = (await conversationsOf(lena)).length;
      const outcome = async (from: string, to: string) =>
        (await inbound(await postmark({ from, to, auth: 'fail' }))).json().outcomes[0].outcome;
      // A domain that asks for it to be refused has it refused; one that asks for care, kept.
      expect(await outcome('ceo@strict.example', 'lena.mail@caime.test')).toBe('unverified');
      expect(await outcome('ceo@careful.example', 'lena.mail@caime.test')).toBe('kept_unverified');
      // A forged customer would be answered as one, and a forged acceptance believed.
      expect(await outcome('patient@bank.example', 'nile.dental@caime.test')).toBe('unverified');
      expect(await outcome('guest@bank.example', 'assistant@caime.test')).toBe('unverified');
      // Under 18: mail from connections alone, and this is nobody's.
      expect(await outcome('anyone@bank.example', 'mina.young@caime.test')).toBe('refused');
      await work();
      expect((await conversationsOf(lena)).length).toBe(before + 1);
      // So nothing stands in for its sender in a conversation of hers.
      expect(
        await t.ctx.db
          .selectFrom('participants as p')
          .innerJoin('conversations as c', 'c.id', 'p.conversation_id')
          .select('c.id')
          .where('p.user_id', '=', mina.user.id)
          .where('c.notice', '=', true)
          .execute(),
      ).toHaveLength(0);
    } finally {
      t.ctx.dns = mailDns();
    }
  });
});

describe('following up by email (M16 F2)', () => {
  // Signed in after the year the sweep's test moved the clock, so the session stands.
  let ines: Client;
  beforeAll(async () => {
    ines = await signup(t, {
      displayName: 'Ines Mail',
      handle: 'ines.mail',
      email: 'ines.mail@example.com',
    });
  });

  it('writes again as a person by mail would: a day apart, twice at most, until they answer', async () => {
    const convo = (
      await ines.post('/v1/conversations/by-email', { email: 'sami@outside.example', name: 'Sami' })
    ).conversation.id as string;
    const write = (n: number) =>
      ines.req('POST', `/v1/conversations/${convo}/messages`, {
        clientId: `ines-to-sami-${n}`,
        kind: 'text',
        body: `Following up, note ${n}.`,
      });
    sends = [];
    expect((await write(1)).statusCode).toBeLessThan(300);
    // Not again within the day, and it says when.
    const soon = await write(2);
    expect(soon.statusCode).toBe(403);
    expect(soon.json().error.code).toBe('awaiting_acceptance');
    expect(soon.json().error.message).toMatch(
      /^You can follow up (at|tomorrow at) .+: once a day, twice at most, until they answer\.$/,
    );
    t.clock.advance(24 * 3_600_000 + 60_000);
    expect((await write(2)).statusCode).toBeLessThan(300);
    t.clock.advance(24 * 3_600_000 + 60_000);
    expect((await write(3)).statusCode).toBeLessThan(300);
    // Twice at most, however long it's been: then nothing more until they answer.
    t.clock.advance(7 * 24 * 3_600_000);
    const fourth = await write(4);
    expect(fourth.statusCode).toBe(403);
    expect(fourth.json().error.message).toBe('You can write again once they answer.');
    await work();
    expect(sends.filter((m) => m.To === 'sami@outside.example')).toHaveLength(3);
    // Someone on Caime is asked once, as before, however long it's been.
    const rami = await signup(t, {
      displayName: 'Rami Stranger',
      handle: 'rami.stranger',
      email: 'rami.stranger@example.com',
    });
    const dm = (await ines.post('/v1/conversations', { kind: 'direct', userId: rami.user.id }))
      .conversation.id as string;
    const toRami = (n: number) =>
      ines.req('POST', `/v1/conversations/${dm}/messages`, {
        clientId: `ines-to-rami-${n}`,
        kind: 'text',
        body: `Hello Rami, ${n}.`,
      });
    expect((await toRami(1)).statusCode).toBeLessThan(300);
    t.clock.advance(2 * 24 * 3_600_000);
    const again = await toRami(2);
    expect(again.statusCode).toBe(403);
    expect(again.json().error.message).toBe(
      'You can send more once they accept your message request.',
    );
  });
});

describe('cards by email (M16 F3)', () => {
  // Signed in after the year the sweep's test moved the clock, so the sessions stand.
  let rana: Client;
  let dina: Client;
  let clinicId: string;
  beforeAll(async () => {
    rana = await signup(t, {
      displayName: 'Rana Mail',
      handle: 'rana.mail',
      email: 'rana.mail@example.com',
    });
    dina = await signup(t, {
      displayName: 'Dina Owner',
      handle: 'dina.owner',
      email: 'dina.owner@example.com',
    });
    clinicId = (
      await dina.post('/v1/orgs', {
        country: 'EG',
        name: 'Dina Clinic',
        handle: 'dina.clinic',
        kind: 'business',
      })
    ).org.id;
  });

  const ahead = (days: number) => new Date(t.ctx.now().getTime() + days * 86_400_000);
  const meeting = (clientId: string, fields: Record<string, unknown> = {}) => ({
    clientId,
    kind: 'kit',
    payload: {
      kit: 'meeting',
      fields: {
        title: 'Venue walkthrough',
        start: { at: ahead(3).toISOString(), hasTime: true },
        durationMinutes: 30,
        place: 'meet.google.com/abc-defg-hij',
        ...fields,
      },
    },
  });
  /** What a calendar app sends back to the organizer (RFC 6047), for one attendee. */
  const calendarReply = (uid: string, attendee: string, partstat: string, sequence?: number) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      'METHOD:REPLY',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      ...(sequence === undefined ? [] : [`SEQUENCE:${sequence}`]),
      `ATTENDEE;CN=Tarek;PARTSTAT=${partstat}:mailto:${attendee}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
  const answer = (opts: {
    from: string;
    to: string;
    uid: string;
    partstat: string;
    attendee?: string;
    auth?: 'pass' | 'none';
    sequence?: number;
  }) =>
    postmark({
      from: opts.from,
      fromName: 'Tarek',
      to: opts.to,
      subject: `${opts.partstat === 'ACCEPTED' ? 'Accepted' : 'Declined'}: Venue walkthrough`,
      text: `Tarek has ${opts.partstat.toLowerCase()} this invitation.`,
      auth: opts.auth ?? 'pass',
      attachments: [
        {
          name: 'invite.ics',
          type: 'application/ics',
          content: calendarReply(
            opts.uid,
            opts.attendee ?? opts.from,
            opts.partstat,
            opts.sequence,
          ),
        },
      ],
    });
  const cardIn = async (c: Client, convo: string, id: string) =>
    (
      (await c.get(`/v1/conversations/${convo}/messages?limit=50`)).messages as Array<{
        id: string;
        payload: { state?: string };
        mail: { seenAt: string | null; delivery: string | null } | null;
      }>
    ).find((m) => m.id === id);
  const ics = (mail: Record<string, unknown> | undefined) =>
    (
      (mail?.Attachments ?? []) as Array<{ Name: string; ContentType: string; Content: string }>
    ).map((a) => ({
      ...a,
      // Read with its long lines unfolded (RFC 5545 folds them at 75 octets).
      text: Buffer.from(a.Content, 'base64')
        .toString('utf8')
        .replace(/\r\n[ \t]/g, ''),
    }));
  let convo: string;

  it('a meeting goes in words with its invitation from her address, and their calendar’s yes agrees it', async () => {
    convo = (
      await rana.post('/v1/conversations/by-email', {
        email: 'tarek@outside.example',
        name: 'Tarek',
      })
    ).conversation.id as string;
    sends = [];
    const card = (await rana.post(`/v1/conversations/${convo}/messages`, meeting('rana-meet-1')))
      .message.id as string;
    await work();
    expect(sends).toHaveLength(1);
    const sent = sends[0];
    expect(sent?.From).toBe('Rana Mail <rana.mail@caime.test>');
    expect(sent?.To).toBe('tarek@outside.example');
    expect(sent?.Subject).toBe('Meeting: Venue walkthrough');
    const text = String(sent?.TextBody);
    expect(text).toMatch(
      /^Meeting: Venue walkthrough\nWhen: .+ \(America\/New_York\)\nDuration: 30 min\n/,
    );
    expect(text).toContain('Where: meet.google.com/abc-defg-hij');
    expect(text).toContain('Answer it from your calendar: your answer reaches Rana Mail on Caime.');
    const [invite] = ics(sent);
    expect(invite?.Name).toBe('invite.ics');
    expect(invite?.ContentType).toBe('text/calendar; method=REQUEST; charset=UTF-8');
    expect(invite?.text).toContain('METHOD:REQUEST');
    expect(invite?.text).toContain(`UID:meeting-${card}@caime`);
    expect(invite?.text).toContain('ORGANIZER;CN="Rana Mail":mailto:rana.mail@caime.test');
    expect(invite?.text).toContain('PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:tarek@outside.example');
    expect(invite?.text).toContain('URL:https://meet.google.com/abc-defg-hij');
    expect((await cardIn(rana, convo, card))?.mail?.delivery).toBe('sent');

    // Their calendar's yes, from the address invited, to hers: the card is agreed, nothing posted.
    const before = (await messagesIn(rana, convo)).length;
    const res = await inbound(
      await answer({
        from: 'tarek@outside.example',
        to: 'rana.mail@caime.test',
        uid: `meeting-${card}@caime`,
        partstat: 'ACCEPTED',
      }),
    );
    expect(res.json().outcomes[0].outcome).toBe('answered');
    await t.ctx.flush();
    const moved = await cardIn(rana, convo, card);
    expect(moved?.payload.state).toBe('accepted');
    expect(moved?.mail?.seenAt).toBeTruthy();
    expect((await messagesIn(rana, convo)).length).toBe(before);
    const told = (await rana.get('/v1/notifications')).notifications as Array<{ title: string }>;
    expect(told.some((n) => n.title === 'Tarek: Accepted')).toBe(true);
    // The same answer again changes nothing; and agreeing answered the request, as a reply does.
    const again = await inbound(
      await answer({
        from: 'tarek@outside.example',
        to: 'rana.mail@caime.test',
        uid: `meeting-${card}@caime`,
        partstat: 'ACCEPTED',
      }),
    );
    expect(again.json().outcomes[0].outcome).toBe('duplicate');
    for (const n of [1, 2])
      expect(
        (
          await rana.req('POST', `/v1/conversations/${convo}/messages`, {
            clientId: `rana-after-yes-${n}`,
            kind: 'text',
            body: `See you then, ${n}.`,
          })
        ).statusCode,
      ).toBeLessThan(300);
  });

  it('their calendar’s no declines it, and a cancel here goes as the update that takes it off theirs', async () => {
    const declined = (
      await rana.post(`/v1/conversations/${convo}/messages`, meeting('rana-meet-2'))
    ).message.id as string;
    await work();
    const no = await inbound(
      await answer({
        from: 'tarek@outside.example',
        to: 'rana.mail@caime.test',
        uid: `meeting-${declined}@caime`,
        partstat: 'DECLINED',
      }),
    );
    expect(no.json().outcomes[0].outcome).toBe('answered');
    expect((await cardIn(rana, convo, declined))?.payload.state).toBe('declined');

    sends = [];
    const cancelled = (
      await rana.post(`/v1/conversations/${convo}/messages`, meeting('rana-meet-3'))
    ).message.id as string;
    await work();
    const inviteId = ((sends[0]?.Headers ?? []) as Array<{ Name: string; Value: string }>).find(
      (h) => h.Name === 'Message-ID',
    )?.Value;
    sends = [];
    await rana.post(`/v1/messages/${cancelled}/kit`, { to: 'cancelled' });
    await work();
    expect(sends).toHaveLength(1);
    const update = sends[0];
    expect(String(update?.TextBody)).toMatch(
      /^Cancelled: Venue walkthrough\n.+ \(America\/New_York\)$/,
    );
    expect(
      ((update?.Headers ?? []) as Array<{ Name: string; Value: string }>).find(
        (h) => h.Name === 'In-Reply-To',
      )?.Value,
    ).toBe(inviteId);
    const [cancel] = ics(update);
    expect(cancel?.ContentType).toBe('text/calendar; method=CANCEL; charset=UTF-8');
    expect(cancel?.text).toContain('METHOD:CANCEL');
    expect(cancel?.text).toContain(`UID:meeting-${cancelled}@caime`);
    expect(cancel?.text).toContain('SEQUENCE:1');
    expect(cancel?.text).toContain('STATUS:CANCELLED');
    // Once a card: cancelling can't happen twice, and nothing more is sent.
    sends = [];
    await work();
    expect(sends).toHaveLength(0);
  });

  it('takes an answer only from the address invited, its sender confirmed, for a card that went there', async () => {
    const card = (await rana.post(`/v1/conversations/${convo}/messages`, meeting('rana-meet-4')))
      .message.id as string;
    await work();
    const uid = `meeting-${card}@caime`;
    // Someone else's answer, carried by Tarek's mail.
    const other = await inbound(
      await answer({
        from: 'tarek@outside.example',
        to: 'rana.mail@caime.test',
        uid,
        partstat: 'ACCEPTED',
        attendee: 'someone.else@outside.example',
      }),
    );
    expect(other.json().outcomes[0].outcome).toBe('refused');
    // From an address it never went to.
    const stranger = await inbound(
      await answer({
        from: 'stranger@outside.example',
        to: 'rana.mail@caime.test',
        uid,
        partstat: 'ACCEPTED',
      }),
    );
    expect(stranger.json().outcomes[0].outcome).toBe('refused');
    // Its sender not confirmed (M16 F1): kept as a notice, and the card stays as it was.
    const unconfirmed = await inbound(
      await answer({
        from: 'tarek@outside.example',
        to: 'rana.mail@caime.test',
        uid,
        partstat: 'ACCEPTED',
        auth: 'none',
      }),
    );
    expect(unconfirmed.json().outcomes[0].outcome).toBe('kept_unverified');
    expect((await cardIn(rana, convo, card))?.payload.state).toBe('proposed');
    // A "maybe" moves nothing: it arrives as their mail.
    const maybe = await inbound(
      await answer({
        from: 'tarek@outside.example',
        to: 'rana.mail@caime.test',
        uid,
        partstat: 'TENTATIVE',
      }),
    );
    expect(maybe.json().outcomes[0].outcome).toBe('delivered');
    expect((await cardIn(rana, convo, card))?.payload.state).toBe('proposed');
    // A calendar mail about an event that isn't one of Caime's cards is only mail.
    const theirs = await inbound(
      await answer({
        from: 'tarek@outside.example',
        to: 'rana.mail@caime.test',
        uid: 'abc123@google.com',
        partstat: 'ACCEPTED',
      }),
    );
    expect(theirs.json().outcomes[0].outcome).toBe('delivered');
  });

  it('another time goes to their calendar as the update, and only an answer to it moves the card (M16 F5)', async () => {
    sends = [];
    const card = (await rana.post(`/v1/conversations/${convo}/messages`, meeting('rana-meet-5')))
      .message.id as string;
    await work();
    const inviteId = ((sends[0]?.Headers ?? []) as Array<{ Name: string; Value: string }>).find(
      (h) => h.Name === 'Message-ID',
    )?.Value;
    const uid = `meeting-${card}@caime`;
    const yes = (sequence?: number) =>
      answer({
        from: 'tarek@outside.example',
        to: 'rana.mail@caime.test',
        uid,
        partstat: 'ACCEPTED',
        sequence,
      });
    expect((await inbound(await yes())).json().outcomes[0].outcome).toBe('answered');
    // Rana moves it a day on: the update goes in the invitation's thread, one sequence on, so
    // his calendar moves the event and asks him again. Nothing else of it is mailed.
    sends = [];
    const later = ahead(4);
    expect(
      (
        await rana.req('POST', `/v1/messages/${card}/time`, {
          start: { at: later.toISOString(), hasTime: true },
        })
      ).statusCode,
    ).toBe(200);
    await work();
    expect(sends).toHaveLength(1);
    const update = sends[0];
    expect(update?.Subject).toBe('Re: Meeting: Venue walkthrough');
    expect(String(update?.TextBody)).toMatch(
      /^New time\nMeeting: Venue walkthrough\nWhen: .+ \(America\/New_York\)\nDuration: 30 min\n/,
    );
    expect(
      ((update?.Headers ?? []) as Array<{ Name: string; Value: string }>).find(
        (h) => h.Name === 'In-Reply-To',
      )?.Value,
    ).toBe(inviteId);
    const [moved] = ics(update);
    expect(moved?.ContentType).toBe('text/calendar; method=REQUEST; charset=UTF-8');
    expect(moved?.text).toContain('METHOD:REQUEST');
    expect(moved?.text).toContain(`UID:${uid}`);
    expect(moved?.text).toContain('SEQUENCE:1');
    const stamp = later
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
    expect(moved?.text).toContain(`DTSTART:${stamp}`);
    expect((await cardIn(rana, convo, card))?.payload.state).toBe('proposed');
    // His calendar's answer to the time before, arriving late, moves nothing.
    expect((await inbound(await yes(0))).json().outcomes[0].outcome).toBe('duplicate');
    expect((await cardIn(rana, convo, card))?.payload.state).toBe('proposed');
    // His answer to the new time agrees it.
    expect((await inbound(await yes(1))).json().outcomes[0].outcome).toBe('answered');
    expect((await cardIn(rana, convo, card))?.payload.state).toBe('accepted');
    // Called off: the cancellation goes one sequence past the last time he was sent.
    sends = [];
    await rana.post(`/v1/messages/${card}/kit`, { to: 'cancelled' });
    await work();
    expect(sends).toHaveLength(1);
    const [cancel] = ics(sends[0]);
    expect(cancel?.text).toContain('METHOD:CANCEL');
    expect(cancel?.text).toContain('SEQUENCE:2');
  });

  it('sends what a mail carries in words, and refuses what would never reach them', async () => {
    sends = [];
    await rana.post(`/v1/conversations/${convo}/messages`, {
      clientId: 'rana-pay-1',
      kind: 'kit',
      payload: {
        kit: 'payment_request',
        fields: {
          direction: 'ask',
          amount: { value: 450, currency: 'EGP' },
          note: 'the venue deposit',
        },
      },
    });
    await rana.post(`/v1/conversations/${convo}/messages`, {
      clientId: 'rana-place-1',
      kind: 'location',
      payload: { lat: 30.0444, lng: 31.2357, label: 'Café Riche' },
    });
    await work();
    // Each its own mail, in whichever order the jobs ran.
    const texts = sends.map((m) => String(m.TextBody));
    const pay = texts.find((x) => x.startsWith('Pay: '));
    expect(pay).toMatch(/^Pay: .*450.* for the venue deposit\n/);
    expect(pay).toContain('Rana Mail asks you to pay this.');
    expect(texts.find((x) => x.startsWith('Café Riche'))).toMatch(
      /^Café Riche\nhttps:\/\/www\.openstreetmap\.org\/\?mlat=30\.044400&mlon=31\.235700#map=17\/30\.044400\/31\.235700\n/,
    );
    const refused = async (body: Record<string, unknown>) => {
      const res = await rana.req('POST', `/v1/conversations/${convo}/messages`, body);
      expect(res.statusCode).toBe(400);
      return res.json().error.message as string;
    };
    expect(
      await refused({
        clientId: 'rana-sticker',
        kind: 'sticker',
        payload: { pack: 'caime', sticker: 'cai-wave' },
      }),
    ).toBe('That doesn’t travel by email: they’d never see it.');
    expect(
      await refused({
        clientId: 'rana-poll',
        kind: 'poll',
        payload: {
          question: 'Which day?',
          options: [
            { id: 'a', text: 'Mon' },
            { id: 'b', text: 'Tue' },
          ],
        },
      }),
    ).toBe('That doesn’t travel by email: they’d never see it.');
    expect(
      await refused({
        clientId: 'rana-approval',
        kind: 'kit',
        payload: { kit: 'approval', fields: { title: 'The budget' } },
      }),
    ).toBe('That doesn’t travel by email: they’d never see it.');
    expect(await refused(meeting('rana-weekly', { repeat: 'week' }))).toBe(
      'A time that repeats doesn’t travel by email: send one time.',
    );
    // A meeting held on Caime goes in a one-to-one, with their own link to its call (M16 F6c,
    // below); core's `notByMail` keeps it back elsewhere.
    expect(
      await refused({
        clientId: 'rana-live',
        kind: 'location',
        payload: { lat: 30.0444, lng: 31.2357, live: { minutes: 15 } },
      }),
    ).toBe('A live location doesn’t travel by email: share the place.');
  });

  it('an organization’s appointment goes from its address, confirmed by the customer’s calendar alone', async () => {
    const wrote = await inbound(
      await postmark({
        from: 'karim@outside.example',
        fromName: 'Karim',
        to: 'dina.clinic@caime.test',
        subject: 'A cleaning',
        text: 'Could I come in next week?',
      }),
    );
    expect(wrote.json().outcomes[0].outcome).toBe('delivered');
    await t.ctx.flush();
    type Thread = { conversationId: string; customer: { displayName: string } | null };
    const thread = [
      ...((await dina.get(`/v1/orgs/${clinicId}/inbox?view=customer_waiting`)).threads as Thread[]),
      ...((await dina.get(`/v1/orgs/${clinicId}/inbox?view=new`)).threads as Thread[]),
    ].find((x) => x.customer?.displayName === 'Karim');
    expect(thread).toBeDefined();
    const id = thread?.conversationId as string;
    sends = [];
    smtp.outbox.length = 0;
    const card = (
      await dina.post(`/v1/conversations/${id}/messages`, {
        clientId: 'dina-appointment-1',
        kind: 'kit',
        payload: {
          kit: 'appointment',
          fields: { title: 'Cleaning', start: { at: ahead(5).toISOString(), hasTime: true } },
        },
      })
    ).message.id as string;
    await work();
    expect(sends).toHaveLength(1);
    expect(sends[0]?.From).toBe('Dina Clinic <dina.clinic@caime.test>');
    // On the organization's clock, its country's when it set none.
    expect(String(sends[0]?.TextBody)).toMatch(/\nWhen: .+ \(Africa\/Cairo\)\n/);
    const [invite] = ics(sends[0]);
    expect(invite?.text).toContain(`UID:appointment-${card}@caime`);
    expect(invite?.text).toContain('ORGANIZER;CN="Dina Clinic":mailto:dina.clinic@caime.test');
    const yes = await inbound(
      await answer({
        from: 'karim@outside.example',
        to: 'dina.clinic@caime.test',
        uid: `appointment-${card}@caime`,
        partstat: 'ACCEPTED',
      }),
    );
    expect(yes.json().outcomes[0].outcome).toBe('answered');
    await work();
    expect((await cardIn(dina, id, card))?.payload.state).toBe('confirmed');
    // The customer confirmed it themselves: no booker's mail tells them the clinic did.
    expect(smtp.outbox.filter((m) => m.to === 'karim@outside.example')).toHaveLength(0);
  });

  it('a meeting held on Caime goes with their own link to its call, which signs them in to it alone (M16 F6c)', async () => {
    const withOmar = (
      await rana.post('/v1/conversations/by-email', {
        email: 'omar.f6c@outside.example',
        name: 'Omar',
      })
    ).conversation.id as string;
    sends = [];
    // No place: a meeting is held on Caime.
    const held = meeting('rana-meet-f6c');
    delete (held.payload.fields as { place?: string }).place;
    await rana.post(`/v1/conversations/${withOmar}/messages`, held);
    await work();
    expect(sends).toHaveLength(1);
    const text = String(sends[0]?.TextBody);
    expect(text).toContain('It’s a call on Caime. At its time, join it from your own link:');
    const link = /https?:\/\/\S+\/j\/(cmg_[A-Za-z0-9_-]+)/.exec(text);
    expect(link, text).not.toBeNull();
    const [invite] = ics(sends[0]);
    expect(invite?.text).toContain(`LOCATION:${link?.[0]}`);
    expect(invite?.text).toContain(`URL:${link?.[0]}`);
    // Asked, not yet answered: the link opens it all the same, as theirs to join.
    const seen = await t.app.inject({ method: 'GET', url: `/v1/join/${link?.[1]}` });
    expect(seen.json().meeting).toMatchObject({
      title: 'Venue walkthrough',
      host: 'Rana Mail',
      direct: true,
      booking: false,
    });
    expect(seen.json().guest).toEqual({ name: 'Omar', adult: null });
    const taken = await t.app.inject({
      method: 'POST',
      url: `/v1/join/${link?.[1]}`,
      payload: { adult: true, client: 'native' },
    });
    expect(taken.statusCode, taken.body).toBe(200);
    expect(taken.json().conversationId).toBe(withOmar);
    const omar = clientFor(t, taken.json().token, { id: '', displayName: 'Omar' } as never);
    // Rana's call rings Omar's page, though Omar never answered her first mail in Caime: the link
    // is the invitation. Omar answers it.
    const rung = await rana.req('POST', `/v1/conversations/${withOmar}/calls`, {
      kind: 'video',
      deviceId: 'rana-device',
    });
    expect(rung.statusCode, rung.body).toBe(201);
    const callId = rung.json().call.id as string;
    const answered = await omar.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'omar-device',
    });
    expect(answered.statusCode, answered.body).toBe(200);
    expect((await rana.req('POST', `/v1/calls/${callId}/end`, {})).statusCode).toBe(200);
    // Nothing else of Caime is Omar's.
    expect((await omar.req('GET', '/v1/inbox')).statusCode).toBe(403);
  });
});

describe('invitations from someone’s calendar (M16 F4)', () => {
  let noor: Client;
  let noorId: string;
  beforeAll(async () => {
    noor = await signup(t, {
      displayName: 'Noor Invite',
      handle: 'noor.invite',
      email: 'noor.invite@example.com',
    });
    noorId = (await noor.get('/v1/me')).user.id as string;
  });

  const ahead = (days: number) => new Date(t.ctx.now().getTime() + days * 86_400_000);
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z')
      .replace(/[-:]/g, '');
  const UID = 'q3review0001@google.com';
  /** An event as Google Calendar mails it (RFC 5546), with what a test changes. */
  const calendar = (o: {
    method?: 'REQUEST' | 'CANCEL';
    uid?: string;
    sequence?: number;
    start?: Date;
    minutes?: number;
    organizer?: string;
    attendees?: string[];
    location?: string;
    extra?: string[];
    day?: boolean;
    /** Without its video call: a meeting whose Where they never said. */
    call?: false;
  }) => {
    const start = o.start ?? ahead(3);
    const end = new Date(start.getTime() + (o.minutes ?? 50) * 60_000);
    return [
      'BEGIN:VCALENDAR',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      'VERSION:2.0',
      `METHOD:${o.method ?? 'REQUEST'}`,
      'BEGIN:VEVENT',
      ...(o.day
        ? [`DTSTART;VALUE=DATE:${stamp(start).slice(0, 8)}`]
        : [`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`]),
      `DTSTAMP:${stamp(t.ctx.now())}`,
      `ORGANIZER;CN=Sara Out:mailto:${o.organizer ?? 'sara@outside.example'}`,
      `UID:${o.uid ?? UID}`,
      ...(o.attendees ?? ['sara@outside.example', 'noor.invite@caime.test']).map(
        (a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a}`,
      ),
      ...(o.call === false ? [] : ['X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij']),
      "DESCRIPTION:Let's go over the Q3 numbers\\, bring the deck.\\n\\n-::~:~::~:~:~:~:~:~::~:~::-\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\n-::~:~::~:~:~:~:~:~::~:~::-",
      ...(o.location ? [`LOCATION:${o.location}`] : []),
      `SEQUENCE:${o.sequence ?? 0}`,
      'SUMMARY:Q3 review',
      ...(o.extra ?? []),
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
  };
  const invite = (
    o: Parameters<typeof calendar>[0] & {
      from?: string;
      messageId?: string;
      auth?: 'pass' | 'none';
      extraHeaders?: Array<{ Name: string; Value: string }>;
    } = {},
  ) =>
    postmark({
      from: o.from ?? 'sara@outside.example',
      fromName: 'Sara Out',
      to: 'noor.invite@caime.test',
      subject: 'Invitation: Q3 review @ Wed 21 Oct 2026 10am - 10:50am (noor.invite@caime.test)',
      text: 'Sara Out has invited you to the following event. Reply for noor.invite@caime.test.',
      messageId: o.messageId,
      auth: o.auth,
      extraHeaders: o.extraHeaders,
      attachments: [{ name: 'invite.ics', type: 'application/ics', content: calendar(o) }],
    });
  type Card = {
    id: string;
    kind: string;
    body: string | null;
    senderId: string | null;
    payload: {
      state?: string;
      title?: string;
      fields?: { start?: { at: string }; durationMinutes?: number; place?: string };
      invitation?: { uid: string; sequence: number; attendee: string };
    };
    mail: { subject: string | null } | null;
    files: Array<{ name: string }>;
  };
  const withSara = async () => {
    const all = (await noor.get('/v1/inbox?view=all')).conversations as Array<{
      id: string;
      title: string;
    }>;
    return all.filter((c) => c.title === 'Sara Out');
  };
  const messagesWithSara = async () => {
    const [c] = await withSara();
    return (
      (await noor.get(`/v1/conversations/${c?.id}/messages?limit=50`)).messages as Card[]
    ).filter((m) => m.senderId !== noorId);
  };
  const theCard = async () => (await messagesWithSara()).find((m) => m.kind === 'kit');
  const replyOf = (sent: Record<string, unknown> | undefined) => {
    const a = ((sent?.Attachments ?? []) as Array<{ ContentType: string; Content: string }>)[0];
    return {
      type: a?.ContentType,
      text: Buffer.from(a?.Content ?? '', 'base64')
        .toString('utf8')
        .replace(/\r\n[ \t]/g, ''),
    };
  };
  const header = (sent: Record<string, unknown> | undefined, name: string) =>
    ((sent?.Headers ?? []) as Array<{ Name: string; Value: string }>).find((h) => h.Name === name)
      ?.Value;

  it('is a meeting card from its organizer, after what they wrote, and a yes here goes back to their calendar', async () => {
    const res = await inbound(await invite({ messageId: '<invite-q3-1@outside.example>' }));
    expect(res.json().outcomes[0].outcome).toBe('invited');
    await work();
    // Where their mail lands: one conversation with Sara, no topic named after the invitation.
    expect(await withSara()).toHaveLength(1);
    const [words, card] = await messagesWithSara();
    expect(words?.kind).toBe('text');
    expect(words?.body).toBe("Let's go over the Q3 numbers, bring the deck.");
    expect(card?.kind).toBe('kit');
    expect(card?.payload).toMatchObject({
      kit: 'meeting',
      state: 'proposed',
      title: 'Q3 review',
      fields: {
        title: 'Q3 review',
        durationMinutes: 50,
        place: 'https://meet.google.com/abc-defg-hij',
      },
      invitation: { uid: UID, sequence: 0, attendee: 'noor.invite@caime.test' },
    });
    // The calendar is the card, never a file beside it; the mail is the card's.
    expect([...(words?.files ?? []), ...(card?.files ?? [])]).toHaveLength(0);
    expect(card?.mail?.subject).toContain('Invitation: Q3 review');
    // It asks Noor, and Noor is told of it.
    const told = (await noor.get('/v1/notifications')).notifications as Array<{
      title: string;
    }>;
    expect(told.length).toBeGreaterThan(0);

    sends = [];
    const yes = await noor.req('POST', `/v1/messages/${card?.id}/kit`, { to: 'accepted' });
    expect(yes.statusCode).toBe(200);
    await work();
    expect(sends).toHaveLength(1);
    const sent = sends[0];
    expect(sent?.From).toBe('Noor Invite <noor.invite@caime.test>');
    expect(sent?.To).toBe('sara@outside.example');
    expect(sent?.Subject).toBe('Accepted: Q3 review');
    expect(header(sent, 'In-Reply-To')).toBe('<invite-q3-1@outside.example>');
    const reply = replyOf(sent);
    expect(reply.type).toBe('text/calendar; method=REPLY; charset=UTF-8');
    expect(reply.text).toContain('METHOD:REPLY');
    expect(reply.text).toContain(`UID:${UID}`);
    expect(reply.text).toContain('SEQUENCE:0');
    expect(reply.text).toContain('ORGANIZER;CN="Sara Out":mailto:sara@outside.example');
    expect(reply.text).toContain(
      'ATTENDEE;CN="Noor Invite";PARTSTAT=ACCEPTED:mailto:noor.invite@caime.test',
    );
    // Agreeing to what came from someone new answered their request, as a reply would.
    const [c] = await withSara();
    const mine = await t.ctx.db
      .selectFrom('participants')
      .select('request_state')
      .where('conversation_id', '=', c?.id as string)
      .where('user_id', '=', noorId)
      .executeTakeFirstOrThrow();
    expect(mine.request_state).toBe('accepted');
    // The same mail again, as the provider retries it, is the one card.
    const again = await inbound(await invite({ messageId: '<invite-q3-1@outside.example>' }));
    expect(again.json().outcomes[0].outcome).toBe('duplicate');
  });

  it('their later word moves the same card: a new time asks again, a cancellation cancels it', async () => {
    const before = (await theCard())?.id;
    // A new time (their calendar counts its sequence up): asked again, and Noor is told.
    const later = ahead(4);
    const moved = await inbound(await invite({ sequence: 1, start: later }));
    expect(moved.json().outcomes[0].outcome).toBe('invited');
    await work();
    let card = await theCard();
    expect(card?.id).toBe(before);
    expect(card?.payload.state).toBe('proposed');
    expect(card?.payload.fields?.start?.at).toBe(later.toISOString());
    expect(card?.payload.invitation?.sequence).toBe(1);
    const told = (await noor.get('/v1/notifications')).notifications as Array<{
      title: string;
    }>;
    expect(told.some((n) => n.title === 'Sara Out: New time')).toBe(true);
    // The same word again changes nothing; an older one is past.
    expect(
      (await inbound(await invite({ sequence: 1, start: later }))).json().outcomes[0].outcome,
    ).toBe('duplicate');
    expect(
      (await inbound(await invite({ sequence: 0, start: ahead(9) }))).json().outcomes[0].outcome,
    ).toBe('duplicate');
    expect((await theCard())?.payload.fields?.start?.at).toBe(later.toISOString());
    // Agreed again, for its new time: the answer says which time of theirs it answers.
    sends = [];
    await noor.post(`/v1/messages/${before}/kit`, { to: 'accepted' });
    await work();
    expect(replyOf(sends[0]).text).toContain('SEQUENCE:1');
    // Called off by its organizer: cancelled here, said to Noor, nothing mailed back.
    sends = [];
    const off = await inbound(await invite({ method: 'CANCEL', sequence: 2, start: later }));
    expect(off.json().outcomes[0].outcome).toBe('invited');
    await work();
    expect((await theCard())?.payload.state).toBe('cancelled');
    expect(sends).toHaveLength(0);
    // Their word that it stands after all asks again; Noor's no goes back as one.
    const back = await inbound(await invite({ sequence: 3, start: later }));
    expect(back.json().outcomes[0].outcome).toBe('invited');
    expect((await theCard())?.payload.state).toBe('proposed');
    await noor.post(`/v1/messages/${before}/kit`, { to: 'declined' });
    await work();
    expect(sends.at(-1)?.Subject).toBe('Declined: Q3 review');
    expect(replyOf(sends.at(-1)).text).toContain('PARTSTAT=DECLINED');
    // A new place for the same time is said where the card is; Noor's no stands.
    const room = await inbound(await invite({ sequence: 4, start: later, location: 'Room 4' }));
    expect(room.json().outcomes[0].outcome).toBe('invited');
    card = await theCard();
    expect(card?.payload.state).toBe('declined');
    expect(card?.payload.fields?.place).toBe('Room 4');
  });

  it('is never held on Caime: no guests to ask, nothing that starts it here, and the calendar knows', async () => {
    const res = await inbound(
      await invite({ uid: 'placeless0001@google.com', start: ahead(5), call: false }),
    );
    expect(res.json().outcomes[0].outcome).toBe('invited');
    await work();
    const card = (await messagesWithSara()).find(
      (m) => m.payload.invitation?.uid === 'placeless0001@google.com',
    );
    expect(card).toBeDefined();
    await noor.post(`/v1/messages/${card?.id}/kit`, { to: 'accepted' });
    await work();
    const guests = await noor.req('POST', `/v1/messages/${card?.id}/guests`, {
      email: 'guest@outside.example',
      name: 'Guest',
    });
    expect(guests.statusCode).toBe(400);
    const starts = await t.ctx.db
      .selectFrom('jobs')
      .select('id')
      .where('kind', '=', 'meeting.start')
      .where(sql<boolean>`payload->>'messageId' = ${card?.id as string}`)
      .execute();
    expect(starts).toHaveLength(0);
    const from = ahead(4).toISOString();
    const to = ahead(6).toISOString();
    const items = (await noor.get(`/v1/calendar?from=${from}&to=${to}`)).items as Array<{
      id: string;
      invitation?: boolean;
    }>;
    expect(items.find((i) => i.id === card?.id)?.invitation).toBe(true);
  });

  it('only what reads as theirs alone is a card: anything else arrives as the mail it is', async () => {
    const cardsBefore = (await messagesWithSara()).filter((m) => m.kind === 'kit').length;
    const cases: Array<[string, Parameters<typeof invite>[0], string]> = [
      [
        'someone else’s event',
        { uid: 'n1@google.com', organizer: 'boss@outside.example' },
        'delivered',
      ],
      [
        'not to this address',
        { uid: 'n2@google.com', attendees: ['other@outside.example'] },
        'delivered',
      ],
      ['a series', { uid: 'n3@google.com', extra: ['RRULE:FREQ=WEEKLY'] }, 'delivered'],
      ['a day', { uid: 'n4@google.com', day: true }, 'delivered'],
      ['over', { uid: 'n5@google.com', start: ahead(-2) }, 'delivered'],
      ['longer than a day', { uid: 'n6@google.com', minutes: 26 * 60 }, 'delivered'],
      ['an event Caime has no card of', { uid: 'n7@google.com', method: 'CANCEL' }, 'delivered'],
      ['unconfirmed', { uid: 'n8@google.com', auth: 'none' }, 'kept_unverified'],
    ];
    for (const [what, o, outcome] of cases) {
      const res = await inbound(await invite(o));
      expect([what, res.json().outcomes[0].outcome]).toEqual([what, outcome]);
    }
    await work();
    expect((await messagesWithSara()).filter((m) => m.kind === 'kit')).toHaveLength(cardsBefore);
    // As mail, in the topic its subject names, its calendar is the file it came as.
    const all = (await noor.get('/v1/inbox?view=all')).conversations as Array<{
      id: string;
      title: string;
    }>;
    const topic = all.find((c) => c.title.startsWith('Invitation: Q3 review'));
    const asMail = (await noor.get(`/v1/conversations/${topic?.id}/messages?limit=50`))
      .messages as Card[];
    expect(asMail.some((m) => m.files.some((f) => f.name === 'invite.ics'))).toBe(true);
    // A list's invitation to someone it isn't connected with is a notice, never a card.
    const listed = await inbound(
      await invite({
        uid: 'n9@google.com',
        from: 'events@bulk-sender.example',
        organizer: 'events@bulk-sender.example',
        extraHeaders: [{ Name: 'List-Unsubscribe', Value: '<mailto:off@bulk-sender.example>' }],
      }),
    );
    expect(listed.json().outcomes[0].outcome).toBe('delivered');
    const kits = await t.ctx.db
      .selectFrom('messages')
      .select('id')
      .where('client_id', 'like', 'invite:%')
      .where('kind', '=', 'kit')
      .execute();
    expect(kits).toHaveLength(2);
  });
});
