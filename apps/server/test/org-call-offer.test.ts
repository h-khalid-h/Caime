/**
 * A call nobody on the team took (M16 H8b, R111 (b)): where the organization's AI agent would
 * answer the customer's next words now, it offers in writing to help, opening with who it is
 * where it hasn't spoken there yet (R87). A fixed line, no model; once, never where its answers
 * wait for the team, nor after a call put down at once.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sweepCalls } from '../src/lib/calls';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owns the clinic, and is on its team
let orgId: string;
const LINE = 'Nobody at Delta Clinic could take your call just now.';
type Customer = { c: Client; convo: string };

/** A customer of the clinic, each case its own, so one case's offer stands in no other. */
async function customer(name: string): Promise<Customer> {
  const c = await signup(t, { displayName: name });
  return { c, convo: (await c.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId };
}
const offers = async ({ c, convo }: Customer) =>
  (
    (await c.get(`/v1/conversations/${convo}/messages`)).messages as Array<{
      body: string | null;
      payload: Record<string, unknown> | null;
    }>
  ).filter((m) => m.body?.includes(LINE));
/** They call, nobody takes it (rung out, or put down after `after`), and the jobs that follow run. */
async function untaken({ c, convo }: Customer, after = 60_000) {
  const placed = (
    await c.post(`/v1/conversations/${convo}/calls`, { kind: 'voice', deviceId: 'cust-tab' })
  ).call;
  t.clock.advance(after);
  if (after >= 45_000) await sweepCalls(t.ctx);
  else await c.post(`/v1/calls/${placed.id}/end`, {});
  await runDueJobs(t.ctx);
  await t.ctx.flush();
}

beforeAll(async () => {
  // A key, so the agent may answer; nothing here asks the model (a closed port answers nothing).
  t = await createTestApp({
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
  });
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Delta Clinic',
      handle: 'delta.offer',
      kind: 'clinic',
    })
  ).org.id;
  await noor.patch(`/v1/orgs/${orgId}`, { callsFrom: 'customers' });
  const saved = await noor.req('PUT', `/v1/orgs/${orgId}/agent`, {
    name: 'Dina',
    knowledge: 'Delta Clinic is open every day from nine to five. A check-up is 300 EGP.',
  });
  expect(saved.statusCode).toBe(200);
});
afterAll(async () => {
  await t.close();
});

describe('a call nobody took (M16 H8b)', () => {
  it('lands as the agent’s offer in writing, introducing itself, once', async () => {
    const lina = await customer('Lina Farah');
    const before = t.ctx.metrics.orgCalls.get({ outcome: 'offered' });
    await untaken(lina);
    const made = await offers(lina);
    expect(made).toHaveLength(1);
    expect(made[0]?.body).toMatch(/^Hi Lina, I’m Dina, the AI assistant for Delta Clinic\.\n/);
    expect(made[0]?.payload).toMatchObject({ introduction: true });
    expect(t.ctx.metrics.orgCalls.get({ outcome: 'offered' })).toBe(before + 1);
    // Another untaken call while the offer stands says nothing more.
    await untaken(lina);
    expect(await offers(lina)).toHaveLength(1);
  });

  it('says nothing after a call put down at once', async () => {
    const sami = await customer('Sami Aziz');
    await untaken(sami, 3_000);
    expect(await offers(sami)).toHaveLength(0);
    // Rung a while before they put it down, it went untaken.
    await untaken(sami, 20_000);
    expect(await offers(sami)).toHaveLength(1);
  });

  it('says nothing while its answers wait for the team', async () => {
    const saved = await noor.req('PUT', `/v1/orgs/${orgId}/agent`, {
      name: 'Dina',
      knowledge: 'Delta Clinic is open every day from nine to five. A check-up is 300 EGP.',
      review: true,
    });
    expect(saved.statusCode).toBe(200);
    const hana = await customer('Hana Said');
    await untaken(hana);
    expect(await offers(hana)).toHaveLength(0);
  });
});
