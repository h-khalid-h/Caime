/**
 * One cited answer engine (M17 I4, R66): a question answered by the model from numbered passages
 * ("[n] when · who · where: text"), the answer naming the passages it rests on, which come back
 * as what they were: a message to open at its line, an action, a decision. Search's answer builds
 * its passages from `runSearch`'s own rows (`searchPassages`: whatever search leaves out, the model
 * never sees), Ask about a conversation from the transcript's lines (`conversationPassages`), and
 * Cai's chat hands the found passages to its own prompt (`lib/system-accounts.ts`); every answer
 * from passages anywhere, a catch-up's and a brief's too, is counted on `caime_answers_total` by
 * where and whether it cited a source, the number M17 I4 asks for.
 */
import type {
  AnswerSourceView,
  CallNotesSummaryView,
  ParsedQuery,
  SearchCallHit,
  SearchMessageHit,
  SearchResults,
  TaskView,
} from '@caime/core';
import { previewText } from '@caime/core';
import { zonedParts } from '@caime/core/time';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { AiAssist } from './ai';
import { runAi } from './ai-run';
import { writeUpsFor } from './call-notes-summary';
import { runSearch } from './search-run';
import { transcriptClock } from './transcript';
import type { ConversationLine } from './transcript-of';

/** How many of search's rows a question is answered from. */
export const ANSWER_FROM = 12;
/** How much of one message the model reads. */
export const PASSAGE_CHARS = 400;
/** The most passages an answer cites. */
const CITED_MAX = 6;
/** How much of a call's write-up the model reads, beside the lines found in it. */
const WRITE_UP_CHARS = 800;

/** One numbered passage as the model reads it, and what it stands for. */
export interface AnswerPassage<S> {
  n: number;
  text: string;
  source: S;
}

/**
 * A row search found, as "Ask Cai" in Search answers from it: a message, a decision, an action,
 * a line said in a call (M17 I12a), or Cai's write-up of a call whose lines were found (a call
 * hit with no line).
 */
export type SearchSource =
  | { kind: 'message'; item: SearchMessageHit }
  | { kind: 'decision'; item: NonNullable<SearchResults['decisions']>[number] }
  | { kind: 'task'; item: TaskView }
  | { kind: 'call'; item: SearchCallHit };

/** Where an answer was asked for: the label on `caime_answers_total`, and `runAi`'s feature. */
export type AnswerWhere = 'search-answer' | 'ask';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const two = (n: number) => String(n).padStart(2, '0');

/** A moment as the found passages write it: the weekday, the date and the time, on one clock. */
export function when(iso: string, timeZone: string, withTime = true): string {
  const p = zonedParts(new Date(iso), timeZone);
  const day = `${DAYS[p.weekday]} ${p.year}-${two(p.month)}-${two(p.day)}`;
  return withTime ? `${day} ${two(p.hour)}:${two(p.minute)}` : day;
}

/** A call's write-up as one passage reads it: the summary, then what was decided and what's next. */
function writeUpText(w: CallNotesSummaryView): string {
  const clause = (s: string) => s.trim().replace(/[.!?؟。]+$/u, '');
  const parts = [w.summary.trim()];
  if (w.decisions.length)
    parts.push(`Decided: ${w.decisions.map((d) => clause(d.text)).join('; ')}.`);
  if (w.nextSteps.length)
    parts.push(
      `Next: ${w.nextSteps
        .map((n) =>
          [n.who, clause(n.what), n.due ? `by ${n.due}` : null].filter(Boolean).join(': '),
        )
        .join('; ')}.`,
    );
  return parts.join(' ');
}

/** Counts an answer from passages, wherever it was given: the share with a source is the number. */
export function countAnswer(
  ctx: AppContext,
  where: AnswerWhere | 'chat' | 'catch-up' | 'brief' | 'notes-catch-up',
  cited: number,
): void {
  ctx.metrics.answers.inc({ where, cited: cited > 0 ? 'yes' : 'no' });
}

/**
 * What search found for a query, as passages: the words themselves (not the highlighted snippet,
 * since what search found is already theirs to read), then the decisions and the actions.
 */
export async function searchPassages(
  ctx: AppContext,
  me: string,
  parsed: ParsedQuery,
  timeZone: string,
  limit = ANSWER_FROM,
): Promise<AnswerPassage<SearchSource>[]> {
  const { results } = await runSearch(ctx, me, parsed, limit);
  const messages = results.messages ?? [];
  const calls = results.calls ?? [];
  const tasks = results.tasks ?? [];
  const decisions = results.decisions ?? [];
  if (!messages.length && !calls.length && !tasks.length && !decisions.length) return [];
  const words = new Map(
    messages.length
      ? (
          await ctx.db
            .selectFrom('messages')
            .select([
              'id',
              sql<string>`coalesce(body, concat_ws(' · ', payload->>'title', payload->'fields'->>'reference', payload->'fields'->>'summary'), '')`.as(
                'text',
              ),
            ])
            .where(
              'id',
              'in',
              messages.map((m) => m.id),
            )
            .execute()
        ).map((r) => [r.id, r.text])
      : [],
  );
  // A call whose lines were found brings Cai's write-up of it, where the asker may read it whole;
  // a line is read whole, as a message is.
  const [writeUps, said] = await Promise.all([
    writeUpsFor(
      ctx,
      me,
      calls.map((c) => c.callId),
    ),
    calls.length
      ? ctx.db
          .selectFrom('call_note_lines')
          .select(['id', 'body'])
          .where(
            'id',
            'in',
            calls.flatMap((c) => (c.lineId ? [c.lineId] : [])),
          )
          .execute()
          .then((rows) => new Map(rows.map((r) => [r.id, r.body ?? ''])))
      : new Map<string, string>(),
  ]);
  const firstLine = new Map<string, SearchCallHit>();
  for (const c of calls) if (!firstLine.has(c.callId)) firstLine.set(c.callId, c);
  const sources: SearchSource[] = [
    ...messages.map((item) => ({ kind: 'message' as const, item })),
    ...calls.map((item) => ({ kind: 'call' as const, item })),
    ...[...firstLine.values()]
      .filter((c) => writeUps.has(c.callId))
      .map((c) => ({
        kind: 'call' as const,
        item: { ...c, lineId: null, speakerId: null, speakerName: 'Cai', snippet: '' },
      })),
    ...decisions.map((item) => ({ kind: 'decision' as const, item })),
    ...tasks.map((item) => ({ kind: 'task' as const, item })),
  ];
  const name = (id: string | null, shown: string) => (id === me ? 'You' : shown);
  return sources.map((source, i) => {
    const n = i + 1;
    let line: string;
    if (source.kind === 'message') {
      const m = source.item;
      const where = m.conversationTitle ? ` · ${previewText(m.conversationTitle, 60)}` : '';
      const who = name(m.senderId, m.senderName ?? 'Someone');
      line = `${when(m.createdAt, timeZone)} · ${who}${where}: ${previewText(words.get(m.id) ?? '', PASSAGE_CHARS)}`;
    } else if (source.kind === 'call') {
      const c = source.item;
      const where = c.conversationTitle ? ` in ${previewText(c.conversationTitle, 60)}` : '';
      const writeUp = c.lineId === null ? writeUps.get(c.callId) : undefined;
      line = writeUp
        ? `${when(c.at, timeZone)} · Cai's notes · a call${where}: ${previewText(writeUpText(writeUp), WRITE_UP_CHARS)}`
        : `${when(c.at, timeZone)} · ${name(c.speakerId, c.speakerName)} · in a call${where}: ${previewText(said.get(c.lineId ?? '') ?? '', PASSAGE_CHARS)}`;
    } else if (source.kind === 'decision') {
      line = `${when(source.item.decidedAt, timeZone)} · Decision: ${previewText(source.item.title, 200)}`;
    } else {
      const t = source.item;
      const due = t.dueAt ? `, due ${when(t.dueAt, timeZone, t.dueHasTime)}` : '';
      const done = t.status === 'done' ? ', done' : '';
      line = `${when(t.createdAt, timeZone)} · To do: ${name(t.assignee.id, t.assignee.displayName)}, for ${name(t.owner.id, t.owner.displayName)}: ${previewText(t.title, 200)}${due}${done}`;
    }
    return { n, text: `[${n}] ${line}`, source };
  });
}

/** A search row as an answer's source, for whoever reads the answer away from Search. */
export function sourceOfSearch(s: SearchSource): AnswerSourceView {
  if (s.kind === 'message')
    return {
      kind: 'message',
      conversationId: s.item.conversationId,
      messageId: s.item.id,
      seq: s.item.seq,
      title: s.item.conversationTitle,
      who: s.item.senderName ?? '',
      at: s.item.createdAt,
    };
  if (s.kind === 'call')
    return {
      kind: 'call',
      callId: s.item.callId,
      conversationId: s.item.conversationId,
      seq: s.item.seq,
      lineId: s.item.lineId,
      title: s.item.conversationTitle,
      who: s.item.speakerName,
      at: s.item.at,
    };
  if (s.kind === 'decision')
    return {
      kind: 'decision',
      id: s.item.id,
      title: s.item.title,
      conversationId: s.item.conversationId ?? null,
    };
  return {
    kind: 'task',
    id: s.item.id,
    title: s.item.title,
    conversationId: s.item.conversationId ?? null,
  };
}

/** A conversation's lines as passages: the transcript's numbering, each its message's. */
export function conversationPassages(
  lines: readonly ConversationLine[],
  conversationId: string,
  timeZone: string,
): AnswerPassage<AnswerSourceView>[] {
  const { time } = transcriptClock(timeZone);
  return lines.map((l) => ({
    n: l.n,
    text: `[${l.n}] ${time(l.at)} · ${l.speaker}: ${previewText(l.text, PASSAGE_CHARS)}`,
    source: lineSource(l, conversationId),
  }));
}

/** A transcript's line as a source: the message, opened at its place in the conversation. */
export function lineSource(l: ConversationLine, conversationId: string): AnswerSourceView {
  return {
    kind: 'message',
    conversationId,
    messageId: l.messageId,
    seq: l.seq,
    title: null,
    who: l.speaker,
    at: l.at.toISOString(),
  };
}

/** The lines a catch-up or a brief cited, by number, as sources; an unknown number is let go. */
export function citedLines(
  lines: readonly ConversationLine[],
  conversationId: string,
  numbers: readonly number[],
): AnswerSourceView[] {
  const seen = new Set<string>();
  const out: AnswerSourceView[] = [];
  for (const n of numbers) {
    const l = lines[n - 1];
    if (!l || seen.has(l.messageId)) continue;
    seen.add(l.messageId);
    out.push(lineSource(l, conversationId));
  }
  return out;
}

/**
 * The model's answer from the passages, with the ones it cites as what they stand for (the
 * first `CITED_MAX`, the most telling first, none twice), counted by where it was asked.
 */
export async function answerFrom<S>(
  ctx: AppContext,
  userId: string,
  where: AnswerWhere,
  input: {
    ai: AiAssist;
    question: string;
    passages: readonly AnswerPassage<S>[];
    scope: 'search' | 'conversation';
    /** The time the rules read in the question, as written, for the model to keep. */
    period: string | null;
    language: string;
    today: string;
  },
): Promise<{ answer: string; cited: S[] }> {
  const answered = await runAi(ctx, where, userId, () =>
    input.ai.answerFromFound({
      found: input.passages.map((p) => p.text).join('\n'),
      question: input.question,
      language: input.language,
      today: input.today,
      scope: input.scope,
      period: input.period,
    }),
  );
  const byNumber = new Map(input.passages.map((p) => [p.n, p]));
  const cited: S[] = [];
  for (const n of answered.sources) {
    const p = byNumber.get(n);
    if (p && !cited.includes(p.source)) cited.push(p.source);
    if (cited.length >= CITED_MAX) break;
  }
  countAnswer(ctx, where, cited.length);
  return { answer: answered.answer, cited };
}
