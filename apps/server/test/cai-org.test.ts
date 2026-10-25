/**
 * An organization's day, led by Cai (M17 I15a, R115; the council in docs/REVIEW-2026-10-25-CAI.md
 * §6): its owner and admins hear what needs the team today, every number the Business inbox's own
 * (a tap on its link shows the same), in what to do: customers waiting for a reply and how many of
 * those the AI agent answered (its words never move a thread), its answers waiting to be sent, the
 * questions it couldn't answer, today's bookings on the organization's own clock, orders open.
 * Counts and times only; a team member who doesn't run it hears nothing of it.
 */
import { CAI_ID, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { briefText } from '../src/lib/cai';
import { runDueJobs } from '../src/lib/jobs';
import { orgDays, orgDayText, orgNamed, orgsRunBy } from '../src/lib/org-day';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sami: Client;
let org: { id: string; handle: string };
const threads: Record<string, string> = {};

const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });
const seqOf = async (conversationId: string) =>
  Number(
    (
      await t.ctx.db
        .selectFrom('business_threads')
        .select('last_customer_seq')
        .where('conversation_id', '=', conversationId)
        .executeTakeFirstOrThrow()
    ).last_customer_seq,
  );

const caiChat = async (c: Client) =>
  (await c.post('/v1/conversations', { kind: 'direct', userId: CAI_ID })).conversation.id as string;
/** Something said to Cai, and what Cai says back, as the workers would answer it. */
async function askCai(c: Client, body: string) {
  const chat = await caiChat(c);
  const before = ((await c.get(`/v1/conversations/${chat}/messages`)).messages as any[]).length;
  await say(c, chat, body);
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  const all = (await c.get(`/v1/conversations/${chat}/messages`)).messages as any[];
  return all.slice(before + 1).filter((m) => m.senderId === CAI_ID);
}

beforeAll(async () => {
  t = await createTestApp();
  // Tuesday morning in Cairo, on summer time (UTC+3) until the end of October.
  t.clock.set('2026-10-20T06:00:00Z');
  noor = await signup(t, { displayName: 'Noor Day', country: 'EG', timeZone: 'Africa/Cairo' });
  sami = await signup(t, { displayName: 'Sami Day' });
  org = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental.day',
      kind: 'business',
    })
  ).org;
  // Sami is on the team, not running it.
  await t.ctx.db
    .insertInto('org_members')
    .values({ org_id: org.id, user_id: sami.user.id, role: 'agent' })
    .execute();
  for (const name of ['waits', 'agent', 'answered', 'drafted', 'booked']) {
    const c = await signup(t, { displayName: `Customer ${name}` });
    const thread = await c.post(`/v1/orgs/${org.id}/conversations`, {});
    threads[name] = thread.conversationId;
    if (name === 'booked') {
      await c.post(`/v1/conversations/${thread.conversationId}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'appointment',
          fields: {
            title: 'Cleaning',
            start: { at: '2026-10-20T07:30:00.000Z', hasTime: true },
            durationMinutes: 30,
          },
        },
      });
    } else await say(c, thread.conversationId, `A question from ${name}`);
    t.clock.advance(60_000);
  }
  await say(noor, threads.answered!, 'Yes, we open at nine.');
  // The AI agent answered one (it claims the customer's latest as it does), and wrote an answer
  // for the team to send in another (review on, M16 G6b).
  await t.ctx.db
    .updateTable('business_threads')
    .set({ agent_seq: await seqOf(threads.agent!) })
    .where('conversation_id', '=', threads.agent!)
    .execute();
  const drafted = await seqOf(threads.drafted!);
  await t.ctx.db
    .updateTable('business_threads')
    .set({ agent_seq: drafted })
    .where('conversation_id', '=', threads.drafted!)
    .execute();
  await t.ctx.db
    .insertInto('agent_drafts')
    .values({
      conversation_id: threads.drafted!,
      org_id: org.id,
      seq: drafted,
      action: 'answer',
      body: 'We open at nine.',
      draft: JSON.stringify({ message: 'We open at nine.' }),
    })
    .execute();
  // A question it couldn't answer, open, and one the team dealt with.
  const latestIn = async (conversationId: string) =>
    (
      await t.ctx.db
        .selectFrom('messages')
        .select('id')
        .where('conversation_id', '=', conversationId)
        .orderBy('seq', 'desc')
        .executeTakeFirstOrThrow()
    ).id;
  await t.ctx.db
    .insertInto('agent_questions')
    .values([
      {
        id: uuidv4(),
        org_id: org.id,
        conversation_id: threads.waits!,
        message_id: await latestIn(threads.waits!),
      },
      {
        id: uuidv4(),
        org_id: org.id,
        conversation_id: threads.agent!,
        message_id: await latestIn(threads.agent!),
        done_at: t.ctx.now(),
        done_by: noor.user.id,
      },
    ])
    .execute();
});
afterAll(async () => {
  await t.close();
});

describe('An organization’s day (M17 I15a)', () => {
  it('counts what its Business inbox shows, and what the AI agent did of it', async () => {
    const runs = await orgsRunBy(t.ctx, noor.user.id);
    expect(runs.map((o) => o.name)).toEqual(['Nile Dental']);
    const [day] = await orgDays(t.ctx, runs, t.ctx.now());
    const inbox = await noor.get(`/v1/orgs/${org.id}/inbox?view=customer_waiting`);
    // "Needs a reply" as the inbox counts it: everyone but the one the team answered.
    expect(day!.waiting).toBe(inbox.counts.customer_waiting);
    expect(day!.waiting).toBe(4);
    expect(day!.agentAnswered).toBe(1);
    expect(day!.drafts).toBe(1);
    expect(day!.unanswered).toBe(1);
    expect(day!.bookings).toBe(1);
    expect(day!.orders).toBe(0);
    // Someone on the team who doesn't run it hears nothing of it.
    expect(await orgsRunBy(t.ctx, sami.user.id)).toEqual([]);
  });

  it('says it in what to do, on the organization’s clock, ending at its inbox', async () => {
    const runs = await orgsRunBy(t.ctx, noor.user.id);
    const [day] = await orgDays(t.ctx, runs, t.ctx.now());
    const text = orgDayText(t.ctx, day!, t.ctx.now(), { zone: 'Africa/Cairo', locale: 'en' });
    expect(text.split('\n')).toEqual([
      'At Nile Dental today:',
      expect.stringMatching(/^• 4 customers waiting for a reply, the longest since /),
      '• The AI agent answered one of them; nobody on the team has yet',
      '• One answer the AI agent wrote is waiting for you to send',
      '• One question the AI agent couldn’t answer: teach it in its setup',
      // 07:30 UTC is 10:30 in Cairo.
      '• One booking today, at 10:30 AM',
      `Its inbox: ${t.ctx.config.PUBLIC_URL}/o/nile.dental.day/inbox`,
    ]);
    // Never a customer's words.
    expect(text).not.toContain('A question from');
  });

  it('finds the organization a question names, by name, handle or its first words', async () => {
    const runs = await orgsRunBy(t.ctx, noor.user.id);
    expect(orgNamed(runs, 'nile dental').map((o) => o.id)).toEqual([org.id]);
    expect(orgNamed(runs, '@nile.dental.day').map((o) => o.id)).toEqual([org.id]);
    expect(orgNamed(runs, 'Nile').map((o) => o.id)).toEqual([org.id]);
    expect(orgNamed(runs, 'sara')).toEqual([]);
    expect(orgNamed(runs, 'dental')).toEqual([]);
  });

  it('is Cai’s answer to how it’s doing, by name or not, the brief offered once', async () => {
    const [answer, offer] = await askCai(noor, 'How is Nile Dental doing today?');
    expect(answer.body.split('\n')[0]).toBe('At Nile Dental today:');
    expect(answer.body).toContain(
      '• The AI agent answered one of them; nobody on the team has yet',
    );
    expect(answer.body).toContain(`Its inbox: ${t.ctx.config.PUBLIC_URL}/o/nile.dental.day/inbox`);
    expect(offer.body).toBe(
      'I can tell you this every morning: Settings, then Cai, then the morning brief.',
    );
    expect(offer.payload.briefOffer).toBe(true);
    // Asked again, unnamed: the same day, and the brief isn't offered twice.
    const again = await askCai(noor, 'how’s business');
    expect(again).toHaveLength(1);
    expect(again[0].body.split('\n')[0]).toBe('At Nile Dental today:');
  });

  it('answers in the language it was asked in, as it’s spoken where they live', async () => {
    // Noor lives in Egypt: Cai answers in Cairo's Arabic (R72).
    const [answer] = await askCai(noor, 'كيف وضع العيادة؟');
    expect(answer.body.split('\n')[0]).toBe('في Nile Dental النهارده:');
    expect(answer.body).toContain('• 4 عملاء مستنيين رد، أقدمهم من');
  });

  it('is nobody else’s: a team member who doesn’t run it, or a name that isn’t theirs', async () => {
    const [sami1] = await askCai(sami, 'How is Nile Dental doing?');
    expect(sami1.body).not.toContain('Nile Dental today');
    const [other] = await askCai(noor, 'How is Sara doing?');
    expect(other.body).not.toContain('today:');
  });

  it('says it can, when asked how it helps, to whoever runs one', async () => {
    const [help] = await askCai(noor, 'What can you do?');
    expect(help.body).toContain('And ask how one of your organizations is doing');
    const [plain] = await askCai(sami, 'What can you do?');
    expect(plain.body).not.toContain('one of your organizations');
  });

  it('is in the morning brief of whoever runs it', async () => {
    const { text } = await briefText(t.ctx, noor.user.id);
    expect(text).toContain('At Nile Dental today:');
    expect(text).toContain(`Its inbox: ${t.ctx.config.PUBLIC_URL}/o/nile.dental.day/inbox`);
    expect((await briefText(t.ctx, sami.user.id)).text).not.toContain('Nile Dental');
  });
});
