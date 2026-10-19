/**
 * An organization's AI agent answering by mail (R75 phase 2): a customer who writes to the
 * organization's Caime address is answered by its agent, introduced as an AI, and the answer
 * goes back to them as mail from the organization's address. A stand-in answers both the mail
 * provider's API and the Messages API.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { createTestApp, signup, type TestApp } from './helpers';
import { mailDns, rawMail, SENDER_IP } from './mail-fixtures';

const SECRET = 'a-webhook-secret-of-length';

let t: TestApp;
let stub: Server;
const sends: Array<Record<string, unknown>> = [];
const asked: unknown[] = [];

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
    // The Messages API: the agent's answer.
    asked.push(body);
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
              message: 'Yes: Tuesday from 9am to 6pm.',
              bookAt: null,
              bookFor: null,
              bookItem: null,
              orderLines: null,
              orderWay: null,
              sources: [],
              reason: null,
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
});

afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('an organization’s agent answering by mail (R75)', () => {
  it('answers a customer who wrote to its address, as mail from the organization', async () => {
    const owner = await signup(t, { displayName: 'Noor Owner', handle: 'noor.owner' });
    const orgId = (
      await owner.post('/v1/orgs', {
        country: 'EG',
        name: 'Nile Dental',
        handle: 'nile.dental',
        kind: 'business',
      })
    ).org.id;
    await t.ctx.db
      .updateTable('organizations')
      .set({ verified_at: new Date() })
      .where('id', '=', orgId)
      .execute();
    const made = await owner.req('PUT', `/v1/orgs/${orgId}/agent`, {
      name: 'Nile Dental Assistant',
      knowledge:
        'Nile Dental is open Sunday to Thursday 9am to 6pm. A check-up is 400 EGP. We are at 12 Nile Street.',
    });
    expect(made.statusCode).toBe(200);

    const raw = await rawMail({
      from: 'patient@clinic-customer.example',
      fromName: 'Hana Patient',
      to: ['nile.dental@caime.test'],
      subject: 'Open on Tuesday?',
      text: 'Are you open on Tuesday?',
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
        Subject: 'Open on Tuesday?',
        MessageID: 'pm-in-1',
        TextBody: 'Are you open on Tuesday?',
        HtmlBody: '',
        Headers: [{ Name: 'Message-ID', Value: '<in-1@clinic-customer.example>' }],
        Attachments: [],
        RawEmail: raw,
      },
    });
    expect(res.json().outcomes[0].outcome).toBe('delivered');

    // The agent waits a moment after a customer writes, answers, and its answer goes as mail.
    await t.ctx.flush();
    t.clock.advance(5000);
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    expect(asked).toHaveLength(1);
    expect(sends).toHaveLength(1);
    expect(sends[0]?.From).toBe('Nile Dental <nile.dental@caime.test>');
    expect(sends[0]?.To).toBe('patient@clinic-customer.example');
    expect(sends[0]?.Subject).toBe('Re: Open on Tuesday?');
    // It says it's an AI, for the organization, before it answers (R87).
    const text = String(sends[0]?.TextBody);
    expect(text).toContain('Nile Dental Assistant');
    expect(text).toContain('Yes: Tuesday from 9am to 6pm.');
  });
});
