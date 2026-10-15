/**
 * Mail received before signatures were set apart, and sent before replies said "seen" (R75):
 * the closing lines a sender's mails share fold into their signature once, and a mail later
 * answered by its address is seen at the answer's time (migration 0087).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backfillMailSignatures } from '../src/lib/mail-backfill';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let hussein: Client;
let convo: string;

const SIGNATURE = [
  '*Hussein Khalid*',
  'CEO | *DATA C*',
  '🌐 www.datac.com',
  '📍 Based in Europe | Serving Worldwide',
].join('\n');

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  hussein = await signup(t, { displayName: 'Hussein Khalid' });
  const r = await hassan.post('/v1/connections/requests', { toUserId: hussein.user.id });
  convo = (await hussein.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
});

afterAll(async () => {
  await t.close();
});

/** A message as if it came, or went, as mail (before the change). */
async function mail(
  from: Client,
  body: string,
  direction: 'in' | 'out',
  at: string,
): Promise<string> {
  const { message } = await from.post(`/v1/conversations/${convo}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });
  await t.ctx.db
    .insertInto('mail_messages')
    .values({
      message_id: message.id,
      direction,
      rfc_message_id: `<${uuidv4()}@test>`,
      in_reply_to: null,
      from_address: direction === 'in' ? 'h.khalid@datac.com' : 'hassan@caime.test',
      to_address: direction === 'in' ? 'hassan@caime.test' : 'h.khalid@datac.com',
      subject: 'Test topic',
      provider: 'postmark',
      provider_id: null,
      created_at: new Date(at),
    })
    .execute();
  return message.id as string;
}

describe('mail from before (R75)', () => {
  it('folds the signature a sender’s mails share, once, and marks mail answered later as seen', async () => {
    const first = await mail(
      hussein,
      `First email\n\n\n${SIGNATURE}`,
      'in',
      '2026-10-15T07:30:00Z',
    );
    const reply = await mail(hassan, 'Great job', 'out', '2026-10-15T07:42:00Z');
    const second = await mail(hussein, `Finally\n\n\n\n${SIGNATURE}`, 'in', '2026-10-15T07:45:00Z');
    const unanswered = await mail(hassan, 'Done', 'out', '2026-10-15T07:51:00Z');
    await backfillMailSignatures(t.ctx);
    const read = async (id: string) =>
      t.ctx.db
        .selectFrom('messages as m')
        .innerJoin('mail_messages as mm', 'mm.message_id', 'm.id')
        .select(['m.body', 'mm.signature', 'mm.seen_at'])
        .where('m.id', '=', id)
        .executeTakeFirstOrThrow();
    expect(await read(first)).toMatchObject({
      body: 'First email',
      signature: SIGNATURE.replace(/\*/g, ''),
    });
    expect((await read(second)).body).toBe('Finally');
    // Once: a second pass changes nothing, even for a mail it would now find a match for.
    await t.ctx.db
      .updateTable('mail_messages')
      .set({ signature: null })
      .where('message_id', '=', second)
      .execute();
    await backfillMailSignatures(t.ctx);
    expect((await read(second)).signature).toBeNull();
    // The seen backfill: the mail answered by a later mail in is seen, at the answer's time.
    await sql
      .raw(
        readFileSync(join(__dirname, '../src/db/migrations/0087_mail_seen_backfill.sql'), 'utf8'),
      )
      .execute(t.ctx.db);
    expect((await read(reply)).seen_at?.toISOString()).toBe('2026-10-15T07:45:00.000Z');
    expect((await read(unanswered)).seen_at).toBeNull();
  });
});
