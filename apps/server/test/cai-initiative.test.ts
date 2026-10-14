/**
 * How much Cai does unasked (R66, core `initiative.ts`): with "Less", only suggestions it's
 * quite sure of are offered, it asks about no quiet wait and says nothing before a meeting; with
 * "More" it asks about a wait after a day; "Usual" is what it always did. What's asked for (Find
 * actions) is never held back.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let convo: string;
const DAY = 86_400_000;

const choose = (who: Client, caiInitiative: string) =>
  who.req('PATCH', '/v1/me', { preferences: { caiInitiative } });
/** Sam writes; Noor's waiting suggestions in the conversation afterwards. */
async function samSays(body: string) {
  await sam.post(`/v1/conversations/${convo}/messages`, { clientId: uuidv4(), body });
  await t.ctx.flush();
  return (await noor.get(`/v1/suggestions?conversationId=${convo}&kind=waiting`))
    .suggestions as Array<{ title: string; confidence: number }>;
}

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Initiative' });
  sam = await signup(t, { displayName: 'Sam Initiative' });
  const r = await sam.post('/v1/connections/requests', {
    toUserId: noor.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  convo = (await noor.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('how much Cai does unasked (R66)', () => {
  it('is usual until chosen, and only a known choice is kept', async () => {
    expect((await noor.get('/v1/me')).user.preferences.caiInitiative).toBeUndefined();
    expect((await choose(noor, 'loud')).statusCode).toBe(400);
    expect((await choose(noor, 'less')).statusCode).toBe(200);
    expect((await noor.get('/v1/me')).user.preferences.caiInitiative).toBe('less');
  });

  it('with less, a guess is not offered and a dated promise is', async () => {
    // Undated: "Fairly sure" (0.75), held back.
    expect(await samSays('I will send you the agenda.')).toEqual([]);
    // Dated: "Quite sure" (0.9), offered.
    const dated = await samSays('I will send you the budget tomorrow.');
    expect(dated.map((s) => s.title.toLowerCase())).toEqual([expect.stringContaining('budget')]);
    // Usual again: the undated one is offered as it always was.
    await choose(noor, 'usual');
    const usual = await samSays('I will send you the contract.');
    expect(usual.some((s) => s.title.toLowerCase().includes('contract'))).toBe(true);
  });

  it('asks about a quiet wait after three days, a day with more, never with less', async () => {
    await noor.post('/v1/tasks', {
      title: 'Signed lease',
      assigneeId: sam.user.id,
      conversationId: convo,
    });
    t.clock.advance(DAY + 60_000);
    expect((await noor.get('/v1/attention')).ask).toBeNull();
    await choose(noor, 'more');
    expect((await noor.get('/v1/attention')).ask).not.toBeNull();
    t.clock.advance(3 * DAY);
    await choose(noor, 'less');
    expect((await noor.get('/v1/attention')).ask).toBeNull();
    await choose(noor, 'usual');
    expect((await noor.get('/v1/attention')).ask).not.toBeNull();
  });

  it('with less, nothing is said an hour before a meeting; its brief still opens', async () => {
    const start = new Date(t.clock.now.getTime() + 3 * 3_600_000).toISOString();
    const card = (
      await sam.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: { title: 'Lease review', start: { at: start, hasTime: true } },
        },
      })
    ).message;
    await noor.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    await choose(noor, 'less');
    t.clock.advance(2 * 3_600_000 + 60_000);
    await runDueJobs(t.ctx);
    const titles = async (c: Client) =>
      (await c.get('/v1/notifications')).notifications.map((n: { title: string }) => n.title);
    expect(await titles(noor)).not.toContain('Coming up: Lease review');
    expect(await titles(sam)).toContain('Coming up: Lease review');
    expect((await noor.req('GET', `/v1/messages/${card.id}/brief`)).statusCode).toBe(200);
  });
});
