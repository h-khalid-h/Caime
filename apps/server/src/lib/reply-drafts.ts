/**
 * What became of a reply Cai drafted (M17 I11b), the number I11 is held to. Each draft is kept in
 * `reply_drafts`, one a person and conversation, with the conversation's seq it answered and keyed
 * hashes of its whole and its folded words (never the words: `serverKey('reply.drafts')`), and
 * the `reply-drafts` sweep settles it against the first text its person sent there after that seq:
 * as sent as drafted, or as edited (half its words still there); a draft nothing was sent after
 * within a day was put aside, which `caime_reply_drafts_total` reads as drafted less the other two.
 * Settled by seq alone and in the database, it counts the same whichever instance drafted it and
 * whichever took the send, and costs nothing on the way a message is sent.
 */
import { createHmac } from 'node:crypto';
import { foldForFind } from '@caime/core/fold';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { registerPeriodic } from './jobs';
import { serverKey } from './server-keys';

/** How long a draft waits for its person's next text there. */
const DRAFT_STANDS_MS = 24 * 3_600_000;
/** Of a draft's words, the share still in what was sent for it to count as edited. */
const KEPT_SHARE = 0.5;
const SWEEP_BATCH = 500;
export const REPLY_DRAFTS_TASK = 'reply-drafts';

const wordsOf = (text: string) =>
  new Set(
    foldForFind(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1),
  );

/** The keyed hash a draft's whole and its words are kept as. */
async function hasher(ctx: AppContext): Promise<(text: string) => string> {
  const key = await serverKey(ctx, 'reply.drafts');
  return (text) => createHmac('sha256', key).update(text).digest('base64url').slice(0, 22);
}

export async function noteDraft(
  ctx: AppContext,
  userId: string,
  conversationId: string,
  text: string,
  afterSeq: number,
): Promise<void> {
  const hash = await hasher(ctx);
  const row = {
    after_seq: afterSeq,
    exact_hash: hash(text.trim()),
    word_hashes: [...wordsOf(text)].map(hash),
    drafted_at: ctx.now(),
  };
  await ctx.db
    .insertInto('reply_drafts')
    .values({ user_id: userId, conversation_id: conversationId, ...row })
    .onConflict((oc) => oc.columns(['user_id', 'conversation_id']).doUpdateSet(row))
    .execute();
  ctx.metrics.replyDrafts.inc({ outcome: 'drafted' });
}

/** Each draft against the first text its person sent after it, oldest first, a batch at a time. */
export async function settleDrafts(ctx: AppContext): Promise<void> {
  const hash = await hasher(ctx);
  const gone = ctx.now().getTime() - DRAFT_STANDS_MS;
  for (;;) {
    const { rows } = await sql<{
      user_id: string;
      conversation_id: string;
      exact_hash: string;
      word_hashes: string[];
      drafted_at: Date;
      body: string | null;
      sent: boolean;
    }>`
      select d.user_id, d.conversation_id, d.exact_hash, d.word_hashes, d.drafted_at,
        next.body, next.seq is not null as sent
      from reply_drafts d
      left join lateral (
        select m.seq, m.body from messages m
        where m.conversation_id = d.conversation_id and m.sender_id = d.user_id
          and m.seq > d.after_seq and m.kind = 'text' and m.deleted_at is null
        order by m.seq
        limit 1
      ) next on true
      where next.seq is not null or d.drafted_at < ${new Date(gone)}
      order by d.drafted_at
      limit ${SWEEP_BATCH}
    `.execute(ctx.db);
    for (const r of rows) {
      if (!r.sent) continue;
      const text = r.body?.trim() ?? '';
      if (hash(text) === r.exact_hash) ctx.metrics.replyDrafts.inc({ outcome: 'sent' });
      else {
        const sent = new Set([...wordsOf(text)].map(hash));
        const kept = r.word_hashes.filter((w) => sent.has(w)).length;
        if (r.word_hashes.length > 0 && kept / r.word_hashes.length >= KEPT_SHARE)
          ctx.metrics.replyDrafts.inc({ outcome: 'edited' });
      }
    }
    // Settled, or waited a day for nothing: either way it's done, in one statement, and a draft
    // made again meanwhile (a newer `drafted_at`) stays.
    if (rows.length)
      await sql`
        delete from reply_drafts d
        using (values ${sql.join(
          rows.map(
            (r) =>
              sql`(${r.user_id}::uuid, ${r.conversation_id}::uuid, ${r.drafted_at}::timestamptz)`,
          ),
        )}) as v (user_id, conversation_id, drafted_at)
        where d.user_id = v.user_id and d.conversation_id = v.conversation_id
          and d.drafted_at = v.drafted_at
      `.execute(ctx.db);
    if (rows.length < SWEEP_BATCH) break;
  }
}

export function registerReplyDraftSweep(): void {
  registerPeriodic({
    name: REPLY_DRAFTS_TASK,
    everyMs: 10 * 60_000,
    background: true,
    run: settleDrafts,
  });
}
