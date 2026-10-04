/**
 * What a person's own choices teach Caime (M11, core `learning.ts`): three of one person's
 * suggestions of a kind passed on make the next one quieter, three taken make it readier, the
 * reason kept on the suggestion; a mixed history teaches nothing; the kind at large needs more;
 * and nothing is learned for anyone who turned it off.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let omar: Client;
let withSam: string;
let withOmar: string;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
/** Sam (or Omar) promises something: a "waiting" suggestion for Noor, after the effects run. */
async function promise(from: Client, conversationId: string, what: string) {
  await from.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    body: `I will send you the ${what} tomorrow.`,
  });
  await t.ctx.flush();
  const { suggestions } = await noor.get(
    `/v1/suggestions?conversationId=${conversationId}&kind=waiting`,
  );
  const s = suggestions.find((x: { title: string }) => x.title.toLowerCase().includes(what));
  expect(s, what).toBeTruthy();
  return s as { id: string; payload: Record<string, unknown> };
}

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  omar = await signup(t, { displayName: 'Omar Said' });
  withSam = await connect(sam, noor);
  withOmar = await connect(omar, noor);
});
afterAll(async () => {
  await t.close();
});

describe('what a person’s choices teach (M11)', () => {
  it('three of Sam’s promises passed on make the next one quieter, with the count', async () => {
    for (const what of ['agenda', 'budget', 'contract']) {
      const s = await promise(sam, withSam, what);
      expect(s.payload.learned).toBeUndefined();
      await noor.post(`/v1/suggestions/${s.id}/dismiss`, {});
    }
    const fourth = await promise(sam, withSam, 'deck');
    expect(fourth.payload.learned).toEqual({
      lean: 'quiet',
      accepted: 0,
      dismissed: 3,
      of: 'person',
    });
    // Omar's first promise: nothing learned about Omar, and the kind at large hasn't enough.
    const omars = await promise(omar, withOmar, 'invoice');
    expect(omars.payload.learned).toBeUndefined();
  });

  it('three of Omar’s taken make the next one readier; a mixed history teaches nothing', async () => {
    const taken = await noor.get(`/v1/suggestions?conversationId=${withOmar}&kind=waiting`);
    await noor.post(`/v1/suggestions/${taken.suggestions[0].id}/accept`, {});
    for (const what of ['photos', 'map']) {
      const s = await promise(omar, withOmar, what);
      await noor.post(`/v1/suggestions/${s.id}/accept`, {});
    }
    const next = await promise(omar, withOmar, 'keys');
    expect(next.payload.learned).toMatchObject({ lean: 'favoured', accepted: 3, of: 'person' });
    // Noor passes on this one: 3 taken, 1 passed on of Omar's last four: still readier.
    await noor.post(`/v1/suggestions/${next.id}/dismiss`, {});
    const after = await promise(omar, withOmar, 'slides');
    expect(after.payload.learned).toMatchObject({ lean: 'favoured', accepted: 3, dismissed: 1 });
    // Two more passed on: mixed, and enough of Omar's to say so: nothing is learned.
    await noor.post(`/v1/suggestions/${after.id}/dismiss`, {});
    const more = await promise(omar, withOmar, 'draft');
    await noor.post(`/v1/suggestions/${more.id}/dismiss`, {});
    const mixed = await promise(omar, withOmar, 'brief');
    expect(mixed.payload.learned).toBeUndefined();
  });

  it('turned off, nothing is learned or kept', async () => {
    await noor.patch('/v1/me', { preferences: { learnFromChoices: false } });
    const s = await promise(sam, withSam, 'plan');
    expect(s.payload.learned).toBeUndefined();
    await noor.patch('/v1/me', { preferences: { learnFromChoices: true } });
    const again = await promise(sam, withSam, 'report');
    expect(again.payload.learned).toMatchObject({ lean: 'quiet', of: 'person' });
  });
});
