/**
 * Caime's own day, led by Cai (M17 I15b, R115; the council in docs/REVIEW-2026-10-25-CAI.md §6):
 * the product's own organization (verified at PUBLIC_URL's domain) has its owner and admins told
 * in their Cai chat when a platform condition crosses (a provider down on two checks in a row, the
 * last backup old, the audit chain failing, jobs failed for good, a report about a child's safety)
 * and again when it clears; once until it clears, again only for more. A check that hasn't run is
 * said, never taken as healthy. A team member who doesn't run it hears none of it.
 */
import { CAI_ID, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WATCH_SETTING, watchPlatform } from '../src/lib/cai';
import { runDueJobs } from '../src/lib/jobs';
import { checkProviders, providerProbes } from '../src/lib/provider-health';
import { writeSetting } from '../src/lib/settings';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sami: Client;
let org: { id: string };

const caiChat = async (c: Client) =>
  (await c.post('/v1/conversations', { kind: 'direct', userId: CAI_ID })).conversation.id as string;
/** What Cai told of Caime itself, past the chat's greeting. */
const fromCai = async (c: Client) =>
  ((await c.get(`/v1/conversations/${await caiChat(c)}/messages`)).messages as any[])
    .filter((m) => m.senderId === CAI_ID && m.body.startsWith('Caime itself:'))
    .map((m) => m.body as string);
const fine = async () => {
  const now = t.ctx.now();
  await writeSetting(
    t.ctx.db,
    'backup.last',
    { file: 'x.dump', bytes: 1, at: now.toISOString(), copy: null },
    now,
  );
  await writeSetting(
    t.ctx.db,
    'audit.last',
    { checkedAt: now.getTime(), ok: true, headSeq: 1 },
    now,
  );
};

beforeAll(async () => {
  t = await createTestApp({
    PUBLIC_URL: 'https://cai.me',
    BACKUP_ENABLED: 'true',
    PROVIDER_HEALTH_ENABLED: 'true',
    // A speech provider nobody answers for: its check fails at once.
    SPEECH_PROVIDER: 'openai',
    SPEECH_API_KEY: 'test-speech-key',
    SPEECH_BASE_URL: 'http://127.0.0.1:9',
  });
  noor = await signup(t, { displayName: 'Noor Ops' });
  sami = await signup(t, { displayName: 'Sami Ops' });
  org = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Caime',
      handle: 'ops.desk.test',
      kind: 'business',
    })
  ).org;
  // Its domain proven as the product's own (orgs.test.ts proves one through DNS).
  await t.ctx.db
    .updateTable('organizations')
    .set({ domain: 'cai.me', verified_at: t.ctx.now() })
    .where('id', '=', org.id)
    .execute();
  await t.ctx.db
    .insertInto('org_members')
    .values({ org_id: org.id, user_id: sami.user.id, role: 'agent' })
    .execute();
});
afterAll(async () => {
  await t.close();
});

describe('Caime’s own day (M17 I15b)', () => {
  it('says nothing while everything checks out, and a provider down once is a blip', async () => {
    await fine();
    await checkProviders(t.ctx);
    await watchPlatform(t.ctx);
    expect(await fromCai(noor)).toEqual([]);
  });

  it('tells whoever runs it what crossed, once, in their Cai chat', async () => {
    await checkProviders(t.ctx);
    const now = t.ctx.now();
    await writeSetting(
      t.ctx.db,
      'audit.last',
      { checkedAt: now.getTime(), ok: false, headSeq: 3 },
      now,
    );
    await t.ctx.db
      .insertInto('jobs')
      .values({ kind: 'test.dead', dead_at: now, attempts: 3, last_error: 'boom' })
      .execute();
    await t.ctx.db
      .insertInto('reports')
      .values({
        id: uuidv4(),
        reporter_id: sami.user.id,
        target_user_id: noor.user.id,
        reason: 'child_safety',
      })
      .execute();
    await watchPlatform(t.ctx);
    const said = await fromCai(noor);
    expect(said).toHaveLength(1);
    expect(said[0]!.split('\n')).toEqual([
      'Caime itself:',
      expect.stringMatching(/isn’t answering: two checks in a row failed\.$/),
      '• The audit log’s chain failed its check: the operator’s token reads it.',
      '• One job failed for good: the operator’s token retries it.',
      '• A report about a child’s safety is waiting.',
    ]);
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select(['level', 'body'])
      .where('user_id', '=', noor.user.id)
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(told.level).toBe('attention');
    // Never the reporter, the person reported or anyone's words.
    expect(said[0]).not.toContain('Sami');
    // Someone on the team who doesn't run it hears none of it.
    expect(await fromCai(sami)).toEqual([]);
    // Asked again with nothing new: nothing.
    await watchPlatform(t.ctx);
    expect(await fromCai(noor)).toHaveLength(1);
  });

  it('tells more of the same again, and what cleared when it clears', async () => {
    await t.ctx.db
      .insertInto('jobs')
      .values({ kind: 'test.dead', dead_at: t.ctx.now(), attempts: 3, last_error: 'boom' })
      .execute();
    await watchPlatform(t.ctx);
    let said = await fromCai(noor);
    expect(said).toHaveLength(2);
    expect(said[1]).toBe(
      'Caime itself:\n• 2 jobs failed for good: the operator’s token retries them.',
    );
    // All put right: the provider answers, the chain checks out, the jobs and the report dealt with.
    const now = t.ctx.now();
    await writeSetting(
      t.ctx.db,
      'providers.last',
      Object.fromEntries(
        providerProbes(t.ctx).map((p) => [
          p.id,
          { up: true, latencyMs: 5, checkedAt: now.getTime(), error: null },
        ]),
      ),
      now,
    );
    await fine();
    await t.ctx.db
      .updateTable('jobs')
      .set({ done_at: now })
      .where('kind', '=', 'test.dead')
      .execute();
    await t.ctx.db.updateTable('reports').set({ closed_at: now, status: 'actioned' }).execute();
    await watchPlatform(t.ctx);
    said = await fromCai(noor);
    expect(said).toHaveLength(3);
    expect(said[2]!.split('\n')).toEqual([
      'Caime itself:',
      expect.stringMatching(/answers again\.$/),
      '• The audit log’s chain checks out again.',
      '• Every job that failed for good has been dealt with.',
      '• No report about a child’s safety is waiting.',
    ]);
    const kept = await t.ctx.db
      .selectFrom('server_settings')
      .select('value')
      .where('key', '=', WATCH_SETTING)
      .executeTakeFirstOrThrow();
    expect(kept.value).toEqual({});
  });

  it('tells an old backup, and says a check that hasn’t run when asked', async () => {
    t.clock.advance(27 * 3_600_000);
    await watchPlatform(t.ctx);
    const said = await fromCai(noor);
    expect(said.at(-1)).toContain('• The last backup is older than a day.');
    // Asked how Caime is doing: its inbox's day, then Caime's own lines; a check that hasn't run
    // is said as not known, never as fine.
    await t.ctx.db.deleteFrom('server_settings').where('key', '=', 'audit.last').execute();
    // Who joined is read by the database's clock (users.created_at): one of them in the last day.
    const at = t.ctx.now().getTime();
    await t.ctx.db
      .updateTable('users')
      .set({ created_at: new Date(at - 2 * 86_400_000) })
      .where('kind', '=', 'human')
      .execute();
    await t.ctx.db
      .updateTable('users')
      .set({ created_at: new Date(at - 3_600_000) })
      .where('id', '=', sami.user.id)
      .execute();
    const chat = await caiChat(noor);
    await noor.post(`/v1/conversations/${chat}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'How is Caime doing?',
    });
    await t.ctx.flush();
    t.clock.advance(1000);
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    const all = ((await noor.get(`/v1/conversations/${chat}/messages`)).messages as any[])
      .filter((m) => m.senderId === CAI_ID)
      .map((m) => m.body as string);
    const answer = all.find((b) => b.includes('Caime itself:') && b.includes('Running'))!;
    expect(answer.split('\n')[0]).toBe('Nothing needs the team at Caime today.');
    expect(answer).toContain('• The last backup is older than a day.');
    expect(answer).toContain('• One check hasn’t run lately, so it isn’t known');
    expect(answer).toContain('• One person joined in the last day');
    expect(answer).toContain('• Running unknown');
  });
});
