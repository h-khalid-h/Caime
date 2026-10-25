/**
 * Retrieval in every interface language (M17 I5, convention 17): the golden set's lines sent as
 * messages and found, or not, by their queries through `GET /v1/search`; the database's fold held
 * equal to core's and its article-free forms to `bareArabic`; the plan held to the folded index;
 * what matches ranked by its words and its age, marked where it was found; names found as people
 * type them.
 */
import { MATCH_END, MATCH_START, uuidv4 } from '@caime/core';
import { foldForFind } from '@caime/core/fold';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bareArabic, foldSql, messageVectorSql } from '../src/lib/fold-sql';
import { RETRIEVAL_GOLDEN, type RetrievalLine } from './fixtures/retrieval-golden';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let chat: string;
const sent = new Map<RetrievalLine, string>();

interface FoundMessage {
  id: string;
  snippet: string;
}

const say = async (c: Client, conversationId: string, body: string) =>
  (await c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body }))
    .message as { id: string };
const search = async (c: Client, q: string): Promise<FoundMessage[]> => {
  const r = await c.get(`/v1/search?q=${encodeURIComponent(q)}&limit=50`);
  return (r.results.messages ?? []) as FoundMessage[];
};

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  const r = await noor.post('/v1/connections/requests', { toUserId: sam.user.id });
  chat = (await sam.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  for (const line of RETRIEVAL_GOLDEN) sent.set(line, (await say(sam, chat, line.stored)).id);
  await t.ctx.flush();
});

afterAll(async () => {
  await t?.close();
});

describe('retrieval in every interface language (M17 I5)', () => {
  it('folds in the database exactly as core does, and takes the same article off', async () => {
    const texts = [...new Set(RETRIEVAL_GOLDEN.flatMap((l) => [l.stored, l.query]))];
    const wrong: string[] = [];
    for (const text of texts) {
      const { rows } = await sql<{
        fold: string;
        find: string;
      }>`select ${foldSql(sql`${text}::text`)} as fold, caime_find_text(${text}::text) as find`.execute(
        t.ctx.db,
      );
      const fold = foldForFind(text);
      const bare = fold
        .split(/[^ء-ي]+/)
        .map((w) => bareArabic(w))
        .filter(Boolean);
      const find = [fold, ...bare].join(' ');
      if (rows[0]?.fold !== fold) wrong.push(`${text}: database ${rows[0]?.fold}, core ${fold}`);
      if (rows[0]?.find !== find) wrong.push(`${text}: database ${rows[0]?.find}, server ${find}`);
    }
    expect(wrong).toEqual([]);
  });

  for (const lang of ['ar', 'fr', 'tr', 'en'] as const) {
    it(`finds every ${lang} line as it was labelled, and marks what it found`, async () => {
      const lines = RETRIEVAL_GOLDEN.filter((l) => l.lang === lang);
      expect(lines.length).toBeGreaterThanOrEqual(9);
      const wrong: string[] = [];
      for (const line of lines) {
        const results = await search(noor, line.query);
        const hit = results.find((m) => m.id === sent.get(line));
        if (Boolean(hit) !== line.finds)
          wrong.push(
            `"${line.query}" ${line.finds ? 'missed' : 'found'} "${line.stored}" (${line.why})`,
          );
        else if (hit && !hit.snippet.includes(MATCH_START))
          wrong.push(`"${line.query}" found "${line.stored}" but marked nothing: ${hit.snippet}`);
      }
      expect(wrong).toEqual([]);
    });
  }

  it('reads the folded index, never the table', async () => {
    await t.ctx.db.transaction().execute(async (trx) => {
      await sql`set local enable_seqscan = off`.execute(trx);
      const plan = await sql<{
        'QUERY PLAN': string;
      }>`explain select m.id from messages m where ${messageVectorSql('m')} @@ to_tsquery('simple', ${"'احمد':*"})`.execute(
        trx,
      );
      expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toContain('messages_search_fold');
    });
  });

  it('puts the best answer first, a newer before an older that answers as well', async () => {
    const old = await say(sam, chat, 'harbor lantern');
    const scattered = await say(sam, chat, 'a lantern by the harbor');
    const starts = await say(sam, chat, 'harborside lanterns glow');
    const side = await say(sam, chat, 'the harbor lantern is lit');
    await t.ctx.flush();
    await sql`update messages set created_at = created_at - interval '300 days' where id = ${old.id}`.execute(
      t.ctx.db,
    );
    const ids = (await search(noor, 'harbor lantern')).map((m) => m.id);
    // Both words whole and side by side; both by their starts, side by side; both whole apart;
    // the same words as the first, but ten months old.
    expect(ids).toEqual([side.id, starts.id, scattered.id, old.id]);
  });

  it('marks the words as they were written, inside a long message', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`);
    long[40] = 'Œuvre';
    await say(sam, chat, long.join(' '));
    await t.ctx.flush();
    const [hit] = await search(noor, 'oeuvre');
    expect(hit?.snippet).toBe(
      `…w36 w37 w38 w39 ${MATCH_START}Œuvre${MATCH_END} w41 w42 w43 w44 w45 w46 w47 w48 w49 w50 w51 w52 w53…`,
    );
  });

  it('finds a person as their name is typed', async () => {
    const ayse = await signup(t, { displayName: 'Ayşe Işık' });
    for (const q of ['ayse', 'isik', 'AYŞE']) {
      const r = await noor.get(`/v1/people/search?q=${encodeURIComponent(q)}`);
      expect([q, (r.results as Array<{ person: { id: string } }>).map((p) => p.person.id)]).toEqual(
        [q, expect.arrayContaining([ayse.user.id])],
      );
    }
  });
});
