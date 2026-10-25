/**
 * What someone missed (M17 I3, R66): the conversations with something new (Needs-you first, then
 * the rest, as the inbox ranks them by `rank`; never what the person put aside), each read since this person last read it by the
 * rules alone (`missedKindOf` over the message intelligence: asked of them, promised, decided,
 * a card ahead), in one query for the batch, never a private conversation (R18) and never more
 * than `MISSED_LINES` of a conversation. With AI assist on, `summariseMissed` sends the same new
 * lines to the light model as numbered passages and keeps the cited summary in memory by read
 * position (`fingerprint`), so a recap opened twice is asked for once and a message read or
 * written since asks again. The route (`GET /attention/missed`) and Cai's chat (`missedText`)
 * read the same.
 */
import { createHash } from 'node:crypto';
import type {
  AttentionSection,
  InboxItemView,
  MissedConversationView,
  MissedKind,
  MissedLineView,
  MissedResponse,
  MissedSourceView,
  MissedSummaryView,
} from '@caime/core';
import {
  analyzeMessage,
  MISSED_CHARS,
  MISSED_CONVERSATIONS,
  MISSED_LINES,
  MISSED_SHOWN,
  missedKindOf,
  missedLinesShown,
  tr,
  trn,
  truncate,
} from '@caime/core';
import { currencyOfCountry } from '@caime/core/countries';
import { isSystemKind } from '@caime/core/system-ids';
import { type SqlBool, sql } from 'kysely';
import type { AppContext } from '../context';
import { languageName } from './ai';
import { aiGate } from './ai-gate';
import { runAi } from './ai-run';
import { languageOf } from './i18n';
import { buildInbox } from './inbox';
import { readableBy } from './messages';
import { transcriptClock, wordsFor } from './transcript';
import { TtlCache } from './ttl-cache';

/** A line's words as the recap shows them and as the model reads them. */
const LINE_CHARS = 280;
/** A summary is kept this long for the same read position. */
const SUMMARY_TTL_MS = 30 * 60_000;

/** A new line of a conversation, as the model reads it: numbered across the recap. */
interface Passage {
  n: number;
  conversationId: string;
  title: string;
  messageId: string;
  seq: number;
  text: string;
}

export interface MissedRead {
  /** The rules' recap, with no summary yet. */
  view: Omit<MissedResponse, 'summary' | 'label'>;
  /** Every new line read, for the summary; empty when nothing was. */
  passages: Passage[];
  /** The read positions the recap stands on: the same again is the same recap. */
  fingerprint: string;
}

const summaries = new TtlCache<string, MissedSummaryView>(5_000, SUMMARY_TTL_MS);

/** In a group, a space's conversation or a broadcast the writer is named; elsewhere the title says who. */
const groupLike = (item: InboxItemView) =>
  item.kind === 'group' || item.kind === 'community' || item.kind === 'broadcast';

/**
 * What the recap leaves alone: a notice (mail's bulk), a stranger's request not yet taken, and
 * what the person put aside themselves (archived, muted or marked quiet); the inbox shows those
 * in their own places. The rest is ranked as the inbox ranks it: Needs-you first, then by time.
 */
const LEFT_ALONE: ReadonlySet<AttentionSection> = new Set([
  'notices',
  'requests',
  'archived',
  'quiet',
]);

/**
 * The rules' recap for one person: every conversation with something unread (Needs-you first,
 * as the inbox ranks them), the new lines of each (others' words since they last read, never a
 * system line), sorted by what they are.
 */
export async function readMissed(
  ctx: AppContext,
  userId: string,
  /** Organizations that keep their conversations from this request (M16 G3): left out. */
  closed: readonly string[] = [],
): Promise<MissedRead> {
  const now = ctx.now();
  const inbox = await buildInbox(ctx, userId, closed);
  const needs = inbox.conversations
    .filter(
      (c) =>
        c.unreadCount > 0 &&
        c.privacyClass !== 'private' &&
        !LEFT_ALONE.has(c.section) &&
        // Cai's and the friends' chats: their words are answers, nothing missed (R67).
        !(c.other && isSystemKind(c.other.kind)),
    )
    .sort((a, b) => b.rank - a.rank);
  const chosen = needs.slice(0, MISSED_CONVERSATIONS);
  const empty: MissedRead = {
    view: { conversations: [], unread: 0, more: 0 },
    passages: [],
    fingerprint: fingerprintOf(userId, []),
  };
  if (chosen.length === 0) return empty;

  const [me, seats] = await Promise.all([
    ctx.db
      .selectFrom('users')
      .select(['time_zone', 'locale', 'workweek', 'country'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('participants')
      .select(['conversation_id', 'last_read_seq'])
      .where('user_id', '=', userId)
      .where(
        'conversation_id',
        'in',
        chosen.map((c) => c.id),
      )
      .execute(),
  ]);
  const after = new Map(seats.map((s) => [s.conversation_id, Number(s.last_read_seq)]));
  const fingerprint = fingerprintOf(
    userId,
    chosen.map((c) => `${c.id}:${after.get(c.id) ?? 0}:${c.lastSeq}`),
  );

  // Others' new lines, the latest MISSED_LINES of each conversation, in one query: a window over
  // the batch, each conversation's floor its own read position.
  const floor = sql`case m.conversation_id ${sql.join(
    chosen.map((c) => sql`when ${c.id}::uuid then ${String(after.get(c.id) ?? 0)}::bigint`),
    sql` `,
  )} end`;
  const fresh = ctx.db
    .selectFrom('messages as m')
    .select([
      'm.id',
      'm.conversation_id',
      'm.seq',
      'm.sender_id',
      'm.kind',
      'm.body',
      'm.payload',
      'm.created_at',
      'm.card_start_at',
      'm.deleted_at',
    ])
    .select(
      sql<number>`row_number() over (partition by m.conversation_id order by m.seq desc)`.as('rn'),
    )
    .where(
      'm.conversation_id',
      'in',
      chosen.map((c) => c.id),
    )
    .where(sql<SqlBool>`m.seq > (${floor})`)
    .where('m.sender_id', 'is distinct from', userId)
    .where('m.kind', '<>', 'system')
    .where(readableBy(userId, now, 'm'));
  const rows = await ctx.db
    .selectFrom(fresh.as('x'))
    .select([
      'x.id',
      'x.conversation_id',
      'x.seq',
      'x.sender_id',
      'x.kind',
      'x.body',
      'x.payload',
      'x.created_at',
      'x.card_start_at',
      'x.deleted_at',
    ])
    .where('x.rn', '<=', MISSED_LINES)
    .orderBy('x.conversation_id')
    .orderBy('x.seq')
    .execute();

  // Who wrote, by name, where the conversation's title doesn't say (a group).
  const senderIds = [
    ...new Set(
      rows
        .filter((r) => groupLike(chosen.find((c) => c.id === r.conversation_id)!))
        .map((r) => r.sender_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
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

  const clock = transcriptClock(me.time_zone);
  const currency = currencyOfCountry(me.country);
  const passages: Passage[] = [];
  const byConversation = new Map<string, MissedLineView[]>();
  const firstNew = new Map<string, number>();
  for (const m of rows) {
    const item = chosen.find((c) => c.id === m.conversation_id)!;
    const seq = Number(m.seq);
    if (!firstNew.has(item.id)) firstNew.set(item.id, seq);
    const text = wordsFor(m, LINE_CHARS);
    if (!text.trim()) continue;
    const who = groupLike(item) ? (names.get(m.sender_id ?? '') ?? tr('Someone')) : item.title;
    passages.push({
      n: passages.length + 1,
      conversationId: item.id,
      title: item.title,
      messageId: m.id,
      seq,
      text: `${clock.time(m.created_at)} · ${item.title} · ${who}: ${text}`,
    });
    const analysis =
      m.kind === 'text' || m.kind === 'voice' || m.kind === 'media' || m.kind === 'file'
        ? analyzeMessage(text, {
            now: m.created_at,
            timeZone: me.time_zone,
            locale: me.locale,
            workweek: me.workweek,
            currency,
          })
        : null;
    const kind: MissedKind | null = missedKindOf(
      analysis,
      { kind: m.kind, cardStartAt: m.card_start_at },
      now,
    );
    if (!kind) continue;
    const lines = byConversation.get(item.id) ?? [];
    lines.push({ kind, seq, messageId: m.id, who, text, at: m.created_at.toISOString() });
    byConversation.set(item.id, lines);
  }

  const conversations: MissedConversationView[] = chosen.map((item) => ({
    id: item.id,
    title: item.title,
    kind: item.kind,
    unread: item.unreadCount,
    firstNewSeq: firstNew.get(item.id) ?? item.lastSeq,
    lines: missedLinesShown(byConversation.get(item.id) ?? [], MISSED_SHOWN),
  }));
  return {
    view: {
      conversations,
      unread: chosen.reduce((n, c) => n + c.unreadCount, 0),
      more: needs.length - chosen.length,
    },
    passages,
    fingerprint,
  };
}

function fingerprintOf(userId: string, positions: string[]): string {
  return createHash('sha256')
    .update(`${userId}|${positions.join(',')}`)
    .digest('hex');
}

/**
 * The model's cited summary of what was read (M17 I3c), for someone AI assist allows: the new
 * lines as numbered passages, at most `MISSED_CHARS` of them (the newest conversations whole,
 * the rest left out), the sources the lines it cites; kept by read position for half an hour.
 * Null when there's nothing to sum up.
 */
export async function summariseMissed(
  ctx: AppContext,
  userId: string,
  read: MissedRead,
): Promise<MissedSummaryView | null> {
  if (read.passages.length === 0) return null;
  const nowMs = ctx.now().getTime();
  const kept = summaries.get(read.fingerprint, nowMs);
  if (kept) return kept;
  const { ai, me } = await aiGate(ctx, userId);
  let budget = MISSED_CHARS;
  const sent: Passage[] = [];
  for (const p of read.passages) {
    budget -= p.text.length + 8;
    if (budget < 0 && sent.length > 0) break;
    sent.push(p);
  }
  const language = languageName(await languageOf(ctx, userId));
  const { answer, sources } = await runAi(ctx, 'missed', userId, () =>
    ai.missed({
      passages: sent.map((p) => `[${p.n}] ${p.text}`).join('\n'),
      language,
      today: transcriptClock(me.time_zone).day(ctx.now()),
    }),
  );
  const byNumber = new Map(sent.map((p) => [p.n, p]));
  const cited: MissedSourceView[] = [];
  for (const n of sources) {
    const p = byNumber.get(n);
    if (p && !cited.some((c) => c.messageId === p.messageId))
      cited.push({
        conversationId: p.conversationId,
        title: p.title,
        seq: p.seq,
        messageId: p.messageId,
      });
  }
  const summary: MissedSummaryView = { text: truncate(answer, 2000), sources: cited };
  summaries.set(read.fingerprint, summary, nowMs);
  return summary;
}

/** A line's words with what it is, for the chat. */
function lineText(line: MissedLineView): string {
  switch (line.kind) {
    case 'ask':
      return tr('Asked of you: {text}', { text: line.text });
    case 'promise':
      return tr('Promised: {text}', { text: line.text });
    case 'decision':
      return tr('Decided: {text}', { text: line.text });
    case 'coming':
      return tr('Coming up: {text}', { text: line.text });
  }
}

/** The recap as Cai says it in its chat (M17 I3b): the rules' lines, then the summary if any. */
export function missedText(
  view: Omit<MissedResponse, 'summary' | 'label'>,
  summary: MissedSummaryView | null,
): string {
  if (view.conversations.length === 0) return tr('Nothing new since you last looked.');
  const parts: string[] = [
    tr('You missed {messages} in {conversations}.', {
      messages: trn(view.unread, '{n} new message', '{n} new messages'),
      conversations: trn(view.conversations.length, '{n} conversation', '{n} conversations'),
    }),
  ];
  for (const c of view.conversations) {
    const head = `${c.title} · ${trn(c.unread, '{n} new', '{n} new')}`;
    parts.push(
      c.lines.length ? `${head}\n${c.lines.map((l) => `– ${lineText(l)}`).join('\n')}` : head,
    );
  }
  if (view.more > 0)
    parts.push(
      trn(
        view.more,
        'And {n} more conversation needs you.',
        'And {n} more conversations need you.',
      ),
    );
  if (summary) parts.push(tr('In short: {summary}', { summary: summary.text }));
  return parts.join('\n\n');
}
