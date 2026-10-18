/**
 * What's deleted is gone (M16 B2, REVIEW 2026-10-17 §2 M): a message deleted for everyone, a
 * conversation erased and a message that disappeared leave no copy Caime keeps (the mail row's
 * envelope, the files only it pointed at with their bytes, what an organization's apps were sent
 * of its words), and a person's export carries what is kept of them, never a live invite link.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPeriodic } from '../src/lib/jobs';
import { sweepRecords } from '../src/lib/retention';
import { storageFor } from '../src/lib/storage';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let cal: Client;
let anaBen: string;
let anaCal: string;

const connect = async (a: Client, b: Client) => {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
};
const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });

async function upload(c: Client, name: string) {
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    Buffer.from(`%PDF-1.4 ${name}`),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files',
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${c.token}`,
    },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file.id as string;
}
const sendFile = async (c: Client, conversationId: string, name: string) => {
  const fileId = await upload(c, name);
  const { message } = await c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'file',
    fileIds: [fileId],
  });
  return { messageId: message.id as string, fileId };
};
/** Its row and its bytes: whether the file is still kept, and whether its bytes are. */
const kept = async (fileId: string) => {
  const row = await t.ctx.db
    .selectFrom('files')
    .select('storage_key')
    .where('id', '=', fileId)
    .executeTakeFirst();
  return row ? (await storageFor(t.ctx.config).size(row.storage_key)) !== null : false;
};
const keyOf = async (fileId: string) =>
  (
    await t.ctx.db
      .selectFrom('files')
      .select('storage_key')
      .where('id', '=', fileId)
      .executeTakeFirstOrThrow()
  ).storage_key;

beforeAll(async () => {
  t = await createTestApp();
  ana = await signup(t, { displayName: 'Ana Erase' });
  ben = await signup(t, { displayName: 'Ben Erase' });
  cal = await signup(t, { displayName: 'Cal Erase' });
  anaBen = await connect(ana, ben);
  anaCal = await connect(ana, cal);
});
afterAll(async () => {
  await t.close();
});

describe('a message deleted for everyone', () => {
  it('takes its mail envelope with it', async () => {
    const { message } = await send(ana, anaBen, 'Lunch on Thursday?');
    await t.ctx.db
      .insertInto('mail_messages')
      .values({
        message_id: message.id,
        direction: 'out',
        rfc_message_id: `<${uuidv4()}@cai.test>`,
        from_address: 'ana@cai.test',
        to_address: 'ben@example.com',
        subject: 'Lunch',
        provider: 'postmark',
        html: '<p>Lunch on Thursday?</p>',
        signature: '-- Ana',
      })
      .execute();
    expect((await ana.req('DELETE', `/v1/messages/${message.id}`)).statusCode).toBe(200);
    const row = await t.ctx.db
      .selectFrom('mail_messages')
      .select(['subject', 'from_address', 'html', 'signature'])
      .where('message_id', '=', message.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ subject: null, from_address: '', html: null, signature: null });
  });

  it('takes the file only it held, bytes and all, and leaves one a forward still holds', async () => {
    const alone = await sendFile(ana, anaBen, 'alone.pdf');
    const key = await keyOf(alone.fileId);
    expect(await kept(alone.fileId)).toBe(true);
    expect((await ana.req('DELETE', `/v1/messages/${alone.messageId}`)).statusCode).toBe(200);
    expect(await kept(alone.fileId)).toBe(false);
    expect(await storageFor(t.ctx.config).size(key)).toBeNull();

    const shared = await sendFile(ana, anaBen, 'shared.pdf');
    const forwarded = await ana.req('POST', `/v1/messages/${shared.messageId}/forward`, {
      conversationIds: [anaCal],
      clientId: uuidv4(),
    });
    expect(forwarded.statusCode).toBe(200);
    expect((await ana.req('DELETE', `/v1/messages/${shared.messageId}`)).statusCode).toBe(200);
    expect(await kept(shared.fileId)).toBe(true);
  });
});

describe('a message that disappeared', () => {
  it('takes the file only it held, bytes and all', async () => {
    const gone = await sendFile(ana, anaBen, 'brief.pdf');
    await t.ctx.db
      .updateTable('messages')
      .set({ expires_at: new Date(t.clock.now.getTime() - 60_000) })
      .where('id', '=', gone.messageId)
      .execute();
    await runPeriodic(t.ctx);
    expect(await kept(gone.fileId)).toBe(false);
  });
});

describe('what an organization’s apps were sent (R54)', () => {
  let orgId: string;
  let lina: Client;
  let convo: string;
  const deliveries = async () =>
    (
      await t.ctx.db
        .selectFrom('webhook_deliveries')
        .select(['event', 'payload', 'created_at', 'id'])
        .orderBy('created_at')
        .execute()
    ).filter(
      (d) => (d.payload as { data?: { conversationId?: string } }).data?.conversationId === convo,
    );
  const said = (d: { payload: unknown }) =>
    (d.payload as { data: { message?: { body?: string } } }).data.message?.body;

  beforeAll(async () => {
    orgId = (
      await ana.post('/v1/orgs', {
        country: 'EG',
        name: 'Erase Dental',
        handle: `erase.${uuidv4().slice(0, 6)}`,
        kind: 'clinic',
      })
    ).org.id;
    await t.ctx.db
      .updateTable('organizations')
      .set({ plan: 'business' })
      .where('id', '=', orgId)
      .execute();
    await ana.post(`/v1/orgs/${orgId}/apps`, {
      name: 'Clinic sync',
      scopes: ['messages:read'],
      webhookUrl: 'https://hooks.example/clinic',
      events: ['business.message', 'message.deleted', 'conversation.erased'],
    });
    lina = await signup(t, { displayName: 'Lina Customer' });
    convo = (await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
  });

  it('lose the words of a message deleted for everyone, and hear that it was', async () => {
    const first = (await send(lina, convo, 'My tooth hurts since Monday.')).message;
    await send(lina, convo, 'Do you open on Saturdays?');
    await t.ctx.flush();
    expect((await deliveries()).map(said)).toEqual([
      'My tooth hurts since Monday.',
      'Do you open on Saturdays?',
    ]);
    expect((await lina.req('DELETE', `/v1/messages/${first.id}`)).statusCode).toBe(200);
    await t.ctx.flush();
    const left = await deliveries();
    expect(left.filter((d) => d.event === 'business.message').map(said)).toEqual([
      'Do you open on Saturdays?',
    ]);
    expect(left.filter((d) => d.event === 'message.deleted')).toHaveLength(1);
  });

  it('lose every word of a conversation erased, and hear that it was', async () => {
    expect((await ana.req('DELETE', `/v1/orgs/${orgId}/conversations/${convo}`)).statusCode).toBe(
      200,
    );
    await t.ctx.flush();
    expect([...new Set((await deliveries()).map((d) => d.event))].sort()).toEqual([
      'conversation.erased',
      'message.deleted',
    ]);
  });

  it('keep none past the organization’s own retention, from when each was sent', async () => {
    await send(lina, convo, 'Is Dr Salma in on Tuesday?');
    await t.ctx.flush();
    const [recent] = (await deliveries()).filter((d) => d.event === 'business.message');
    expect(recent).toBeTruthy();
    await t.ctx.db
      .updateTable('organizations')
      .set({ retention_days: 7 })
      .where('id', '=', orgId)
      .execute();
    // Eight days old by the server's clock is past its seven; one sent now isn't.
    await t.ctx.db
      .updateTable('webhook_deliveries')
      .set({ created_at: new Date(t.clock.now.getTime() - 8 * 86_400_000) })
      .where('id', '=', recent!.id)
      .execute();
    const younger = (await send(lina, convo, 'And on Wednesday?')).message;
    await t.ctx.flush();
    await sweepRecords(t.ctx);
    const left = (await deliveries()).filter((d) => d.event === 'business.message');
    expect(left.map(said)).toEqual(['And on Wednesday?']);
    expect(younger.id).toBeTruthy();
  });
});

describe('the export (L row)', () => {
  it('carries the mail envelope, the calendars’ times and a reclaim, never a live invite link', async () => {
    const { message } = await send(ana, anaBen, 'The report is attached.');
    await t.ctx.db
      .insertInto('mail_messages')
      .values({
        message_id: message.id,
        direction: 'out',
        rfc_message_id: `<${uuidv4()}@cai.test>`,
        from_address: 'ana@cai.test',
        to_address: 'ben@example.com',
        subject: 'The report',
        provider: 'postmark',
        delivery: 'delivered',
        delivery_at: new Date('2026-10-18T09:00:00Z'),
      })
      .execute();
    const account = uuidv4();
    await t.ctx.db
      .insertInto('connected_accounts')
      .values({
        id: account,
        user_id: ana.user.id,
        provider: 'google',
        subject: `g-${account}`,
        email: 'ana@gmail.test',
        uses: ['calendar'],
        scopes: [],
        refresh_sealed: Buffer.from('sealed'),
        state: 'connected',
      })
      .execute();
    await t.ctx.db
      .insertInto('external_busy')
      .values({
        account_id: account,
        user_id: ana.user.id,
        start_at: new Date('2026-10-20T08:00:00Z'),
        end_at: new Date('2026-10-20T09:00:00Z'),
      })
      .execute();
    await t.ctx.db
      .insertInto('calendar_pushes')
      .values({
        account_id: account,
        user_id: ana.user.id,
        uid: 'card-1@cai.test',
        event_id: 'evt-1',
        start_at: new Date('2026-10-21T10:00:00Z'),
        end_at: new Date('2026-10-21T10:30:00Z'),
        holds: true,
        fingerprint: 'f',
      })
      .execute();
    const closed = (
      await ana.post('/v1/orgs', {
        country: 'EG',
        name: 'Old Pharmacy',
        handle: `old.${uuidv4().slice(0, 6)}`,
        kind: 'shop',
      })
    ).org;
    await t.ctx.db
      .insertInto('org_reclaims')
      .values({
        org_id: closed.id,
        user_id: ana.user.id,
        token: 'reclaim-token-never-shown',
        created_at: new Date(),
      })
      .execute();
    const link = (await ana.post('/v1/invites', {})).invite.token as string;

    const res = await ana.req('GET', '/v1/me/export');
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(link);
    expect(res.body).not.toContain('reclaim-token-never-shown');
    const data = res.json();
    expect(data.messages.find((m: { id: string }) => m.id === message.id).mail).toMatchObject({
      direction: 'out',
      to: 'ben@example.com',
      subject: 'The report',
      delivery: 'delivered',
    });
    expect(data.busyFromYourCalendars).toEqual([
      { start: '2026-10-20T08:00:00.000Z', end: '2026-10-20T09:00:00.000Z' },
    ]);
    expect(data.writtenToYourCalendars).toEqual([
      expect.objectContaining({ event: 'card-1@cai.test', showsBusy: true }),
    ]);
    expect(data.reclaims).toEqual([
      expect.objectContaining({ organization: { name: 'Old Pharmacy', handle: closed.handle } }),
    ]);
    expect(data.inviteLinks.at(-1)).toMatchObject({ endsWith: link.slice(-4) });
    expect(data.inviteLinks.at(-1).url).toBeUndefined();
  });
});
