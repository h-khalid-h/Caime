/**
 * A conversation as a model reads it, for one viewer (M16 D3, M17 I4): the newest messages within
 * both limits, numbered oldest first, each line what the viewer may read of it (`readableBy`), who
 * wrote it as they may know (a customer's transcript names the organization, never who on its
 * team wrote: R15), and what's new since they last read. Shared by the catch-up, the follow-ups,
 * Ask and the answers that cite a line.
 */
import { systemText, truncate } from '@caime/core';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import type { Transcript } from './ai';
import { maskFor, maskId, maskPayload } from './business';
import { writeUpsByLine, writeUpText } from './call-notes-summary';
import { readableBy } from './messages';
import { transcriptClock, transcriptText, wordsFor } from './transcript';

/** How much of a conversation a model reads: the newest messages, within both limits. */
const TRANSCRIPT_MESSAGES = 200;
const TRANSCRIPT_CHARS = 60_000;
const MESSAGE_CHARS = 1_500;

/** One message as a model reads it: numbered, with what the viewer may know of who wrote it. */
export interface ConversationLine {
  n: number;
  messageId: string;
  seq: number;
  senderId: string | null;
  speaker: string;
  text: string;
  at: Date;
  /** A call's line read with Cai's write-up of it (M17 I12b): the call, to open its notes. */
  callId: string | null;
}

/** How much of a call's write-up the transcript carries beside its line. */
const WRITE_UP_CHARS = 1_500;

/** What the viewer sees of the conversation, newest last, with names rather than ids. */
export async function transcriptOf(
  ctx: AppContext,
  viewerId: string,
  conversationId: string,
  lastReadSeq: number,
  timeZone: string,
  /** Each call's line with Cai's write-up of it, where the viewer may read it whole (I12b). */
  opts: { withCalls?: boolean; fromSeq?: number } = {},
): Promise<{ transcript: Transcript; lines: ConversationLine[]; newCount: number }> {
  const rows = (await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('conversation_id', '=', conversationId)
    .where(readableBy(viewerId, ctx.now()))
    .$if(opts.fromSeq !== undefined, (q) => q.where('seq', '>=', String(opts.fromSeq)))
    .orderBy('seq', 'desc')
    .limit(TRANSCRIPT_MESSAGES)
    .execute()) as Message[];
  // A customer's transcript names the organization, never who on its team wrote (R15).
  const mask = await maskFor(ctx.db, conversationId, viewerId);
  const senderIds = [...new Set(rows.map((m) => m.sender_id).filter((x): x is string => !!x))];
  const names = new Map(
    senderIds.length
      ? (
          await ctx.db
            .selectFrom('users')
            .select(['id', 'display_name'])
            .where('id', 'in', senderIds)
            .execute()
        ).map((u) => [u.id, u.display_name])
      : [],
  );
  // What Cai wrote up of a call, read beside the call's line by whoever may read it whole.
  const writeUps = opts.withCalls
    ? await writeUpsByLine(
        ctx,
        viewerId,
        rows.filter((m) => m.kind === 'system').map((m) => m.id),
      )
    : new Map<string, never>();
  const { time } = transcriptClock(timeZone);
  // Newest first until the budget is spent, then numbered oldest first.
  const kept: Array<{ m: Message; text: string; speaker: string; callId: string | null }> = [];
  let budget = TRANSCRIPT_CHARS;
  for (const m of rows) {
    const call = writeUps.get(m.id);
    const said =
      m.kind === 'system'
        ? systemText(mask ? maskPayload(m.payload, mask) : m.payload, viewerId)
        : wordsFor(m, MESSAGE_CHARS);
    const text = call
      ? `${said.trim().replace(/[.]+$/u, '')}. Cai's notes: ${truncate(writeUpText(call.writeUp), WRITE_UP_CHARS)}`
      : said;
    if (!text.trim()) continue;
    const speaker =
      m.kind === 'system'
        ? 'Caime'
        : m.sender_id === viewerId
          ? 'You'
          : mask
            ? mask.orgName
            : (names.get(m.sender_id ?? '') ?? 'Someone');
    budget -= text.length + speaker.length + 32;
    if (budget < 0 && kept.length > 0) break;
    kept.push({ m, text, speaker, callId: call?.callId ?? null });
  }
  kept.reverse();
  const lineOf = new Map(kept.map((k, i) => [k.m.id, i + 1]));
  const lines: ConversationLine[] = kept.map((k, i) => ({
    n: i + 1,
    messageId: k.m.id,
    seq: Number(k.m.seq),
    senderId: mask ? maskId(mask, k.m.sender_id) : k.m.sender_id,
    speaker: k.speaker,
    text: k.text,
    at: k.m.created_at,
    callId: k.callId,
  }));
  const isNew = (k: (typeof kept)[number]) =>
    Number(k.m.seq) > lastReadSeq && k.m.sender_id !== viewerId && k.m.kind !== 'system';
  const firstNew = kept.findIndex(isNew);
  const text = transcriptText(
    kept.map((k) => ({
      at: time(k.m.created_at),
      who: k.speaker,
      replyTo: k.m.reply_to_id ? lineOf.get(k.m.reply_to_id) : undefined,
      words: k.text,
    })),
  );
  return {
    transcript: { text, newFrom: firstNew >= 0 ? firstNew + 1 : null },
    lines,
    newCount: kept.filter(isNew).length,
  };
}
