/**
 * Caime Mail (PRODUCT-REVIEW R75, phase 1): mail to a handle's address becomes a message from a
 * person the mail server vouched for; a stranger's is a request that keeps every message; a
 * thread is a topic; attachments are files; a reply goes out as mail and says how far it got;
 * signing up with the address claims the history; under 18 takes mail from connections only.
 * The provider stands in: a local server answers its API, and its webhooks are posted here.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { sweepProvisional } from '../src/lib/mail-out';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const DOMAIN = 'caime.test';
const SECRET = 'a-webhook-secret-of-length';

let t: TestApp;
let stub: Server;
let sends: Array<Record<string, unknown>> = [];
let refuseNext = false;
let counter = 0;

/** A mail as Postmark's inbound webhook posts it, from a sender its server vouched for. */
function postmark(m: {
  from: string;
  fromName?: string;
  to: string | string[];
  subject?: string | null;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  auth?: 'pass' | 'fail' | 'none' | 'spf-only' | 'spf-misaligned';
  spam?: boolean;
  attachments?: Array<{ name: string; type: string; content: string }>;
}) {
  counter++;
  const domain = m.from.replace(/^.*@/, '');
  const auth = m.auth ?? 'pass';
  const headers: Array<{ Name: string; Value: string }> = [
    { Name: 'Message-ID', Value: m.messageId ?? `<in-${counter}@${domain}>` },
  ];
  if (auth === 'pass')
    headers.push({
      Name: 'Authentication-Results',
      Value: `mx.caime.test; dkim=pass header.d=${domain}; spf=pass smtp.mailfrom=${m.from}; dmarc=pass header.from=${domain}`,
    });
  if (auth === 'fail')
    headers.push({
      Name: 'Authentication-Results',
      Value: `mx.caime.test; dkim=fail header.d=${domain}; spf=fail smtp.mailfrom=${m.from}; dmarc=fail header.from=${domain}`,
    });
  if (auth === 'spf-only')
    headers.push({
      Name: 'Received-SPF',
      Value: `Pass (sender SPF authorized) identity=mailfrom; envelope-from=${m.from};`,
    });
  if (auth === 'spf-misaligned')
    headers.push({
      Name: 'Received-SPF',
      Value:
        'Pass (sender SPF authorized) identity=mailfrom; envelope-from=bounce@bulk-sender.example;',
    });
  if (m.inReplyTo) headers.push({ Name: 'In-Reply-To', Value: m.inReplyTo });
  if (m.references?.length) headers.push({ Name: 'References', Value: m.references.join(' ') });
  if (m.spam) headers.push({ Name: 'X-Spam-Status', Value: 'Yes, score=9.1' });
  const to = Array.isArray(m.to) ? m.to : [m.to];
  return {
    FromFull: { Email: m.from, Name: m.fromName ?? '' },
    ToFull: to.map((Email) => ({ Email, Name: '' })),
    Subject: m.subject === undefined ? 'Hello from outside' : m.subject,
    MessageID: `pm-in-${counter}`,
    TextBody: m.text ?? 'Could you send me the contract by Friday?',
    HtmlBody: m.html ?? '',
    Headers: headers,
    Attachments: (m.attachments ?? []).map((a) => ({
      Name: a.name,
      ContentType: a.type,
      Content: Buffer.from(a.content).toString('base64'),
    })),
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
  t = await createTestApp({
    METRICS_TOKEN: 'test-metrics-token',
    MAIL_DOMAIN: DOMAIN,
    MAIL_PROVIDER: 'postmark',
    MAIL_PROVIDER_TOKEN: 'test-postmark-token',
    MAIL_WEBHOOK_SECRET: SECRET,
    MAIL_BASE_URL: `http://127.0.0.1:${port}`,
  });
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
      (await inbound(postmark({ from: 'x@example.org', to: 'noor.mail@caime.test' }), null))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await inbound(
          postmark({ from: 'x@example.org', to: 'noor.mail@caime.test' }),
          'wrong-secret-of-length',
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await inbound(
          postmark({ from: 'x@example.org', to: 'noor.mail@caime.test' }),
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
      payload: postmark({ from: 'x@example.org', to: 'nobody.here@caime.test' }),
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
      postmark({
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
      postmark({
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

  it('delivers the same mail once, however often the provider posts it', async () => {
    const same = postmark({
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
    expect(out.TextBody).toBe('Of course. It’s attached to my next message.');
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
      postmark({
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
      postmark({
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
      postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: 'Fwd: Venue for March',
        text: 'Forwarding the quote.',
      }),
    );
    await inbound(
      postmark({
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
      postmark({
        from: 'sara@partner.example',
        to: 'noor.mail@caime.test',
        subject: 'The quote',
        text: 'Attached.',
        attachments: [{ name: 'quote.txt', type: 'text/plain', content: 'Hall: 1,200 EGP' }],
      }),
    );
    const long = `${'word '.repeat(2_500)}end`;
    await inbound(
      postmark({
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

  it('signing up with the address claims the person: the same row, the history theirs', async () => {
    const sara = await signup(t, {
      displayName: 'Sara Haddad',
      handle: 'sara.haddad',
      email: 'sara@partner.example',
    });
    expect(sara.user.id).toBe(sender);
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
  it('drops mail the server didn’t vouch for, spam, and mail to nobody, and counts each', async () => {
    const before = (await conversationsOf(noor)).length;
    expect(
      (
        await inbound(
          postmark({ from: 'spoof@bank.example', to: 'noor.mail@caime.test', auth: 'fail' }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('unverified');
    expect(
      (
        await inbound(
          postmark({ from: 'anon@bank.example', to: 'noor.mail@caime.test', auth: 'none' }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('unverified');
    expect(
      (
        await inbound(
          postmark({
            from: 'news@bank.example',
            to: 'noor.mail@caime.test',
            auth: 'spf-misaligned',
          }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('unverified');
    expect(
      (
        await inbound(
          postmark({ from: 'junk@spam.example', to: 'noor.mail@caime.test', spam: true }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('spam');
    expect(
      (await inbound(postmark({ from: 'x@example.org', to: 'cai@caime.test' }))).json().outcomes[0]
        .outcome,
    ).toBe('unknown');
    expect(
      (await inbound(postmark({ from: 'x@example.org', to: 'x@elsewhere.example' }))).json()
        .outcomes,
    ).toEqual([]);
    expect(
      (
        await inbound(
          postmark({ from: 'x@example.org', to: 'noor.mail@caime.test', text: '', subject: null }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('empty');
    await t.ctx.flush();
    expect((await conversationsOf(noor)).length).toBe(before);
    expect(
      await t.ctx.db
        .selectFrom('users')
        .select('id')
        .where('email', 'in', ['spoof@bank.example', 'anon@bank.example', 'junk@spam.example'])
        .execute(),
    ).toHaveLength(0);
    // SPF aligned with the From domain is enough where no DKIM or DMARC result was written.
    expect(
      (
        await inbound(
          postmark({
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
    expect(metrics.body).toContain('caime_mail_total{direction="in",outcome="unverified"} 3');
    expect(metrics.body).toContain('caime_mail_total{direction="in",outcome="spam"} 1');
  });

  it('under 18, an address takes mail from people they’re connected with and nobody else, without a bounce', async () => {
    const stranger = await inbound(
      postmark({ from: 'anyone@partner.example', to: 'mina.young@caime.test' }),
    );
    expect(stranger.json().outcomes[0].outcome).toBe('refused');
    // A minor takes requests from nobody they don't know (R29): Mina asks Omar.
    const withOmar = await connect(mina, omar);
    const known = await inbound(
      postmark({
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
      postmark({
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
          postmark({ from: 'omar.mail@example.com', to: 'noor.mail@caime.test', text: 'Blocked.' }),
        )
      ).json().outcomes[0].outcome,
    ).toBe('refused');
    await noor.req('DELETE', `/v1/blocks/${omar.user.id}`);
  });

  it('mail to an organization’s address is a customer thread in its inbox, answered as the organization', async () => {
    const res = await inbound(
      postmark({
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
