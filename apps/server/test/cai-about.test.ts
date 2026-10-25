/**
 * Cai about one person (M16 G11): "what am I waiting for from Ana", "what did Ana ask me", "what
 * did I promise Ana", "when am I seeing Ana", "what did Ana and I agree", "did Ana pay", answered
 * by the rules from the person's own records with that person alone, in the language asked, with
 * no model and no cost. A whole name wins over the start of one, two people of that name are
 * answered together, a relationship stands for a name ("my landlord"), a name nobody of theirs has
 * is said so, and nothing an older row ties to a private conversation is said (R18).
 */
import { CAI_ID, SYSTEM_ACCOUNTS, uuidv4, uuidv7 } from '@caime/core';
import { foldForFind } from '@caime/core/fold';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let ana: Client;
let omar: Client;
let cai: string;
let withAna: string;
let withOmar: string;
const MOMO = SYSTEM_ACCOUNTS.find((a) => a.handle === 'momo')!.id;

const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const card = async (c: Client, conversationId: string, kit: string, fields: object) =>
  (
    await c.post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit, fields },
    })
  ).message;
/** What an account says to a question, a moment after it's asked. */
async function ask(question: string, conversationId = cai): Promise<string> {
  await send(hassan, conversationId, question);
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  const said = (await hassan.get(`/v1/conversations/${conversationId}/messages`))
    .messages as Array<{ body: string; kind: string }>;
  return said.filter((m) => m.kind === 'text').at(-1)!.body;
}
async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
const wait = (title: string, assigneeId: string, conversationId: string) =>
  hassan.post('/v1/tasks', { title, assigneeId, shared: true, conversationId });

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  ana = await signup(t, { displayName: 'Ana Lopez' });
  const silva = await signup(t, { displayName: 'Ana Silva' });
  const anabel = await signup(t, { displayName: 'Anabel Smith' });
  omar = await signup(t, { displayName: 'Omar Haddad' });
  const ahmed = await signup(t, { displayName: 'أحمد سالم' });
  const ayse = await signup(t, { displayName: 'Ayşe Kaya' });
  const dana = await signup(t, { displayName: 'Dana Cole' });
  withAna = await connect(hassan, ana);
  const withSilva = await connect(hassan, silva);
  const withAnabel = await connect(hassan, anabel);
  withOmar = await connect(hassan, omar);
  await connect(hassan, ahmed);
  const withAyse = await connect(hassan, ayse);
  const withDana = await connect(hassan, dana);
  await hassan.post('/v1/relationships', {
    userId: dana.user.id,
    sphere: 'service_provider',
    role: 'landlord',
  });
  cai = (await hassan.post('/v1/conversations', { kind: 'direct', userId: CAI_ID })).conversation
    .id;

  await wait('Send the floor plan', ana.user.id, withAna);
  await wait('Water the plants', silva.user.id, withSilva);
  await wait('Bring the ladder', anabel.user.id, withAnabel);
  await wait('Book the van', omar.user.id, withOmar);
  await wait('Return the drill', ayse.user.id, withAyse);
  await wait('Fix the boiler', dana.user.id, withDana);
  await ana.post('/v1/tasks', {
    title: 'Review the lease',
    assigneeId: hassan.user.id,
    shared: true,
    conversationId: withAna,
  });
  await hassan.post('/v1/tasks', { title: 'Call the landlord', conversationId: withAna });
  await ana.post('/v1/decisions', { conversationId: withAna, title: 'Move in on the 1st' });

  const coffee = await card(hassan, withAna, 'meeting', {
    title: 'Coffee with Ana',
    start: { at: new Date(t.clock.now.getTime() + 3 * 86_400_000).toISOString(), hasTime: true },
    durationMinutes: 30,
  });
  await ana.post(`/v1/messages/${coffee.id}/kit`, { to: 'accepted' });
  const deposit = await card(hassan, withAna, 'payment_request', {
    direction: 'ask',
    amount: { value: 40, currency: 'EUR' },
    note: 'Deposit share',
  });
  await ana.post(`/v1/messages/${deposit.id}/kit`, { to: 'sent' });
  // Omar asks Hassan: it's Hassan who'd pay, so Omar has paid him nothing.
  await card(omar, withOmar, 'payment_request', {
    direction: 'ask',
    amount: { value: 15, currency: 'EUR' },
    note: 'Fuel',
  });

  // A wait kept before private conversations kept nothing on the server (M16 G7).
  const secret = (
    await hassan.post('/v1/conversations', { kind: 'direct', userId: ana.user.id, private: true })
  ).conversation.id;
  await t.ctx.db
    .insertInto('tasks')
    .values({
      id: uuidv7(),
      owner_id: hassan.user.id,
      assignee_id: ana.user.id,
      title: 'Garden deposit of 900',
      conversation_id: secret,
      created_at: t.ctx.now(),
      updated_at: t.ctx.now(),
    })
    .execute();
});
afterAll(async () => {
  await t?.close();
});

describe('Cai about one person (M16 G11)', () => {
  it('answers each question for that person alone, by the rules', async () => {
    expect(await ask('What am I waiting for from Ana Lopez?')).toBe(
      'You’re waiting on Ana Lopez for one thing:\n• Send the floor plan',
    );
    expect(await ask('what did Ana Lopez ask me to do?')).toBe(
      'From Ana Lopez, one thing is asked of you:\n• Review the lease',
    );
    expect(await ask('what did I promise Ana Lopez?')).toBe(
      'You said you’d do one thing for Ana Lopez:\n• Call the landlord',
    );
    expect(await ask('when am I seeing Ana Lopez?')).toMatch(
      /^Coming up with Ana Lopez:\n• .+ · Coffee with Ana$/,
    );
    expect(await ask('what did Ana Lopez and I agree?')).toBe(
      'What you and Ana Lopez decided:\n• Move in on the 1st · Today',
    );
    expect(await ask('did Ana Lopez pay?')).toBe(
      'Payments from Ana Lopez:\n• €40.00 for Deposit share · Sent · Today',
    );
    expect(await ask('did Omar pay?')).toBe('No card asks Omar Haddad to pay you.');
    expect(await ask('what does Omar owe me?')).toBe(
      'You’re waiting on Omar Haddad for one thing:\n• Book the van',
    );
  });

  it('answers everyone of that name together, never the start of another name', async () => {
    // Ana Lopez and Ana Silva, each line saying whose; Anabel is someone else.
    expect(await ask('what am I waiting for from Ana?')).toBe(
      'You’re waiting on Ana Lopez and Ana Silva for 2 things:\n• Ana Lopez · Send the floor plan\n• Ana Silva · Water the plants',
    );
    expect(await ask('what am I waiting for from Anab?')).toBe(
      'You’re waiting on Anabel Smith for one thing:\n• Bring the ladder',
    );
  });

  it('finds a name as it’s typed, or the relationship it stands for, and says who it doesn’t know', async () => {
    expect(await ask('What am I waiting for from Ayse?')).toBe(
      'You’re waiting on Ayşe Kaya for one thing:\n• Return the drill',
    );
    expect(await ask('what am I waiting for from my landlord?')).toBe(
      'You’re waiting on Dana Cole for one thing:\n• Fix the boiler',
    );
    expect(await ask('what am I waiting for from Zed?')).toBe(
      'I don’t know who “Zed” is among your people.',
    );
    // "احمد" without its hamza finds "أحمد", and the answer is in the Arabic asked in (R72).
    expect(await ask('مستني ايه من احمد؟')).toBe('مش بتستنى أي حاجة من أحمد سالم.');
  });

  it('is a friend’s to answer too', async () => {
    const momo = (await hassan.post('/v1/conversations', { kind: 'direct', userId: MOMO }))
      .conversation.id;
    await t.ctx.flush();
    expect(await ask('did Ana Lopez pay?', momo)).toBe(
      'Payments from Ana Lopez:\n• €40.00 for Deposit share · Sent · Today',
    );
  });

  it('says nothing an older row ties to a private conversation, about one person or all', async () => {
    expect(await ask('what am I waiting for from Ana Lopez?')).not.toContain('Garden deposit');
    const all = await ask('What am I waiting on?');
    expect(all).toMatch(/^You’re waiting on 6 things:/);
    expect(all).not.toContain('Garden deposit');
  });

  it('compares names with the fold the database writes (M17 I5: caime_fold is foldForFind)', async () => {
    const names = [
      'Ayşe Işık',
      'Hélène Œuvre',
      'Søren Łukasz',
      'أَحْمَد',
      'ليلى فاطمة',
      'محـــمد',
      'İlkay',
    ];
    for (const name of names) {
      const { rows } = await sql<{ f: string }>`select caime_fold(${name}) as f`.execute(t.ctx.db);
      expect([name, rows[0]!.f]).toEqual([name, foldForFind(name)]);
    }
  });
});
