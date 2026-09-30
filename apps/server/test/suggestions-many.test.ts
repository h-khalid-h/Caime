import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let convo: string;

const send = async (c: Client, id: string, body: string) =>
  (await c.post(`/v1/conversations/${id}/messages`, { clientId: crypto.randomUUID(), body }))
    .message;

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid', handle: 'hassan' });
  sarah = await signup(t, { displayName: 'Sarah Smith', handle: 'sarahs' });
  const r = await hassan.post('/v1/connections/requests', {
    toUserId: sarah.user.id,
    relationship: { sphere: 'work', role: 'colleague', orgName: 'DATA C' },
  });
  convo = (await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('several steps, one approval (R37)', () => {
  let ids: string[];
  let titles: Record<string, string>;

  it('does each step of a card in turn, one that fails not stopping the rest', async () => {
    await send(hassan, convo, "I'll send the proposal tomorrow.");
    await send(hassan, convo, "I'll book the venue on Friday.");
    await t.ctx.flush();
    const mine = (await hassan.get(`/v1/suggestions?conversationId=${convo}`))
      .suggestions as Array<{
      id: string;
      kind: string;
      title: string;
    }>;
    ids = mine.filter((s) => s.kind === 'reminder').map((s) => s.id);
    titles = Object.fromEntries(mine.map((s) => [s.id, s.title]));
    expect(ids).toHaveLength(2);
    // Someone else's suggestion in the same card fails on its own; Hassan's two are done.
    const hers = (await sarah.get(`/v1/suggestions?conversationId=${convo}`)).suggestions[0].id;
    const { results } = await hassan.post('/v1/suggestions/accept', { ids: [...ids, hers] });
    expect(results.map((r: { accepted?: unknown; error?: string }) => Boolean(r.accepted))).toEqual(
      [true, true, false],
    );
    expect(results[2].error).toMatch(/suggestion/i);
    const tasks = await hassan.get('/v1/tasks');
    expect(tasks.tasks.map((x: { title: string }) => x.title).sort()).toEqual([
      'Book venue',
      'Send proposal',
    ]);
    expect(
      (await hassan.get(`/v1/suggestions?conversationId=${convo}`)).suggestions.filter(
        (s: { kind: string }) => s.kind === 'reminder',
      ),
    ).toEqual([]);
  });

  it('takes a step back: the task goes and the suggestion is offered again', async () => {
    expect(await hassan.post(`/v1/suggestions/${ids[0]}/undo`)).toEqual({ ok: true });
    const tasks = await hassan.get('/v1/tasks');
    expect(tasks.tasks.map((x: { title: string }) => x.title)).toEqual([titles[ids[1]!]]);
    const again = (await hassan.get(`/v1/suggestions?conversationId=${convo}`)).suggestions;
    expect(again.map((s: { id: string }) => s.id)).toContain(ids[0]);
    // Taken back once: a second undo finds nothing accepted.
    expect((await hassan.req('POST', `/v1/suggestions/${ids[0]}/undo`)).statusCode).toBe(404);
    // A task changed by hand since stays: it's the person's now.
    const kept = (await hassan.get('/v1/tasks')).tasks[0];
    await hassan.patch(`/v1/tasks/${kept.id}`, { title: 'Book the venue and the caterer' });
    expect((await hassan.req('POST', `/v1/suggestions/${ids[1]}/undo`)).statusCode).toBe(400);
  });

  it('a decision stays: the undo says so, and nobody else can take back my steps', async () => {
    await send(sarah, convo, "Let's go with the blue design.");
    await t.ctx.flush();
    const decision = (await hassan.get(`/v1/suggestions?conversationId=${convo}&kind=decision`))
      .suggestions[0];
    expect(decision).toBeTruthy();
    await hassan.post(`/v1/suggestions/${decision.id}/accept`);
    const undo = await hassan.req('POST', `/v1/suggestions/${decision.id}/undo`);
    expect([undo.statusCode, undo.json().error.code]).toEqual([400, 'not_undoable']);
    expect((await sarah.req('POST', `/v1/suggestions/${ids[0]}/undo`)).statusCode).toBe(404);
    expect((await hassan.req('POST', '/v1/suggestions/accept', { ids: [] })).statusCode).toBe(400);
  });
});
