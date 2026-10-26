/**
 * The slipping tell (M17 I15a2, R115): a customer waiting past the reply target while the
 * organization is open, with nobody on it, is told once to whoever runs it, in their Cai chat and
 * their own language, and to nobody who asked Cai for less or who doesn't run it. A wait answered,
 * taken or answered by its AI agent says nothing; one met while it's closed is told as it opens.
 */
import { CAI_ID, uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/** Sunday to Thursday, 09:00–17:00 in Cairo (UTC+3 in October 2026: 06:00–14:00Z). */
const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};

let t: TestApp;
let noor: Client;
let lina: Client;
let rami: Client;
let sami: Client;
let orgId: string;

const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });

/** A customer's first words to the organization: their thread. */
async function customerWrites(name: string): Promise<{ c: Client; thread: string }> {
  const c = await signup(t, { displayName: name });
  const thread = (await c.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId as string;
  await say(c, thread, `Hello, a question from ${name}`);
  await t.ctx.flush();
  return { c, thread };
}

/** What Cai told someone unasked of a customer's wait. */
async function toldTo(c: Client): Promise<string[]> {
  const chat = (await c.post('/v1/conversations', { kind: 'direct', userId: CAI_ID })).conversation
    .id as string;
  const all = (await c.get(`/v1/conversations/${chat}/messages`)).messages as Array<{
    senderId: string;
    body: string;
  }>;
  return all
    .filter((m) => m.senderId === CAI_ID && /Nile Dental|نايل/.test(m.body ?? ''))
    .map((m) => m.body);
}

async function later(minutes: number) {
  t.clock.advance(minutes * 60_000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
}

beforeAll(async () => {
  t = await createTestApp();
  // Tuesday 09:30 in Cairo.
  t.clock.set('2026-10-20T06:30:00Z');
  noor = await signup(t, { displayName: 'Noor Owner', country: 'EG', timeZone: 'Africa/Cairo' });
  lina = await signup(t, {
    displayName: 'Lina Admin',
    country: 'EG',
    locale: 'ar-EG',
    timeZone: 'Africa/Cairo',
  });
  rami = await signup(t, { displayName: 'Rami Admin' });
  sami = await signup(t, { displayName: 'Sami Agent' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental.slip',
      kind: 'business',
    })
  ).org.id;
  await t.ctx.db
    .insertInto('org_members')
    .values([
      { org_id: orgId, user_id: lina.user.id, role: 'admin' },
      { org_id: orgId, user_id: rami.user.id, role: 'admin' },
      { org_id: orgId, user_id: sami.user.id, role: 'agent' },
    ])
    .execute();
  // Rami asked Cai for less.
  await sql`update users set preferences = preferences || '{"caiInitiative":"less"}'::jsonb
    where id = ${rami.user.id}`.execute(t.ctx.db);
  await noor.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: HOURS });
});
afterAll(() => t.close());

describe('the slipping tell (M17 I15a2)', () => {
  it('tells whoever runs it once, past the target with nobody on it, in their language', async () => {
    const { c, thread } = await customerWrites('Customer One');
    await later(29);
    expect(await toldTo(noor)).toEqual([]);
    await later(2);
    expect(await toldTo(noor)).toEqual([
      `Customer One has waited 31 min for a reply from Nile Dental, and nobody has taken it yet.\nTheir conversation: ${t.ctx.config.PUBLIC_URL}/c/${thread}`,
    ]);
    // In Cairo's Arabic for Lina; nothing for Rami, who asked for less, or Sami, who doesn't run it.
    const toLina = await toldTo(lina);
    expect(toLina).toHaveLength(1);
    expect(toLina[0]).toMatch(/Customer One/);
    expect(toLina[0]).toMatch(/[؀-ۿ]/);
    expect(await toldTo(rami)).toEqual([]);
    expect(await toldTo(sami)).toEqual([]);
    // Their next words in the same wait are no new wait: told once.
    await say(c, thread, 'Anyone there?');
    await t.ctx.flush();
    await later(31);
    expect(await toldTo(noor)).toHaveLength(1);
  });

  it('says nothing of a wait answered, taken, or answered by its AI agent', async () => {
    const answered = await customerWrites('Customer Two');
    const taken = await customerWrites('Customer Three');
    const agent = await customerWrites('Customer Four');
    await later(10);
    await say(noor, answered.thread, 'We open at nine, come any time.');
    await noor.post(`/v1/business/${taken.thread}/assign`, { userId: sami.user.id });
    await sql`update business_threads set agent_seq = last_customer_seq
      where conversation_id = ${agent.thread}`.execute(t.ctx.db);
    await t.ctx.flush();
    await later(30);
    const told = (await toldTo(noor)).join('\n');
    expect(told).not.toMatch(/Customer (Two|Three|Four)/);
  });

  it('tells a wait met while it was closed as it opens', async () => {
    // Tuesday 17:30 in Cairo, after hours.
    t.clock.set('2026-10-20T14:30:00Z');
    await customerWrites('Customer Five');
    await later(31);
    expect((await toldTo(noor)).join('\n')).not.toMatch(/Customer Five/);
    // Wednesday 09:00 in Cairo.
    t.clock.set('2026-10-21T06:00:00Z');
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    expect((await toldTo(noor)).at(-1)).toMatch(
      /^Customer Five has waited 15 h 30 min for a reply from Nile Dental, and nobody has taken it yet\./,
    );
  });
});
