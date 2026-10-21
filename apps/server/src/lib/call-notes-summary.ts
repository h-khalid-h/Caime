/**
 * Cai's notes of a call (M16 F7e, R112): once a call Cai took notes in has ended and every word in
 * it is heard, Cai writes them once, as a careful note-taker would: what it was about, its topics
 * and their points, what was decided, and the next steps by person. One set of notes a call, for
 * whoever was in it for all of it (R85 (2): someone who came in later reads from when they joined,
 * and catches up on that on ask, F7d), on the asker's allowance (R107), in the language most of it
 * was said in, on the model the asker's plan names, as finding follow-ups does (`aiModel`). Each
 * next step is the suggestion of the person it's for, by the line it came from (F7d's fingerprint,
 * so "Find follow-ups" never offers it twice); in a call of two the other waits on it; a decision is
 * the asker's to record. Nothing here sends anything: the notes are on the call's line, its people
 * are told once, and they go with that line. A line someone deletes writes them again without it,
 * and what was drawn from it and not yet answered goes.
 */
import {
  AI_LABEL,
  type CallNotesSummaryView,
  firstFutureWhen,
  firstName,
  PERSON_ALLOWANCES,
  previewText,
  truncate,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import { baseLanguage, languageName, type NotesSummary } from './ai';
import { aiGate } from './ai-gate';
import { runAi } from './ai-run';
import { readersOf } from './call-notes';
import { AppError } from './errors';
import { asReader, languageOf } from './i18n';
import { enqueue, registerJob } from './jobs';
import { notify } from './notify';
import { createSuggestion } from './suggest';
import { transcriptClock, transcriptText } from './transcript';

export const SUMMARY_JOB = 'call.notes.summary';
/** A line is at most half a minute of speech; the notes read at most this much, both ends kept. */
const LINE_CHARS = 600;
const SUMMARY_CHARS = 60_000;
/**
 * Written a moment after the call ends, once its last lines have landed; lines still being heard
 * put it off (`WAIT_MS`).
 */
const AFTER_MS = 5_000;
/** Lines still being heard put the notes off a while, this many times at most. */
const WAIT_MS = 20_000;
const WAITS = 30;
/** A busy model, or the asker's hour of AI assist used up, puts them off longer. */
const BUSY_MS = 60_000;
const RATE_MS = 10 * 60_000;

/**
 * The notes to write, a moment from now: when a call with notes ends and its line is written
 * (`messageId`, which they go with), and again when someone deletes words of theirs from them
 * (`again`, so it's a job of its own).
 */
export async function queueNotesSummary(
  ctx: AppContext,
  call: Pick<Call, 'id' | 'conversation_id'>,
  opts: { messageId?: string; again?: boolean } = {},
): Promise<void> {
  const again = opts.again === true;
  const now = ctx.now();
  await ctx.db
    .insertInto('call_note_summaries')
    .values({
      call_id: call.id,
      conversation_id: call.conversation_id,
      message_id: opts.messageId ?? null,
      state: 'writing',
      requested_at: now,
    })
    .onConflict((oc) => oc.column('call_id').doUpdateSet({ state: 'writing', requested_at: now }))
    .execute();
  // Each ask is a job of its own, carrying when it was asked: only the latest writes them.
  await enqueue(
    ctx,
    SUMMARY_JOB,
    { callId: call.id, waits: 0, at: now.getTime() },
    {
      runAt: new Date(now.getTime() + AFTER_MS),
      dedupeKey: again ? `${SUMMARY_JOB}:${call.id}:${now.getTime()}` : `${SUMMARY_JOB}:${call.id}`,
      maxAttempts: 3,
    },
  );
}

/**
 * The job again a while from now, as it was asked (`at`): lines not all heard yet, the model busy,
 * or the asker's hour of AI assist used up. After `WAITS` of these there are no notes but the words.
 */
async function later(ctx: AppContext, payload: Record<string, unknown>, waitMs: number) {
  const callId = String(payload.callId ?? '');
  const waits = Number(payload.waits ?? 0);
  if (waits >= WAITS) return void (await stateOf(ctx, callId, 'none'));
  await enqueue(
    ctx,
    SUMMARY_JOB,
    { callId, waits: waits + 1, at: payload.at ?? null },
    {
      runAt: new Date(ctx.now().getTime() + waitMs),
      dedupeKey: `${SUMMARY_JOB}:${callId}:wait:${ctx.now().getTime()}`,
      maxAttempts: 3,
    },
  );
}

interface Line {
  id: string;
  speakerId: string;
  speaker: string;
  text: string;
  at: Date;
  language: string | null;
}

/** Every heard line of a call's notes, oldest first, its two ends kept when it ran long. */
async function linesOf(ctx: AppContext, callId: string) {
  const rows = await ctx.db
    .selectFrom('call_note_lines as l')
    .innerJoin('call_notes as n', 'n.id', 'l.notes_id')
    .innerJoin('users as u', 'u.id', 'l.speaker_id')
    .select([
      'l.id',
      'l.speaker_id',
      'u.display_name',
      'l.body',
      'l.spoken_at',
      'l.language',
      'l.state',
    ])
    .where('n.call_id', '=', callId)
    .orderBy('l.spoken_at')
    .orderBy('l.id')
    .execute();
  const waiting = rows.filter((r) => r.state === 'waiting').length;
  const heard: Line[] = rows.flatMap((r) =>
    r.state === 'heard' && r.body?.trim()
      ? [
          {
            id: r.id,
            speakerId: r.speaker_id,
            speaker: r.display_name,
            text: truncate(r.body.replace(/\s+/g, ' ').trim(), LINE_CHARS),
            at: r.spoken_at,
            language: r.language,
          },
        ]
      : [],
  );
  // A long call keeps how it opened and where it landed: the middle goes first.
  let total = heard.reduce((n, l) => n + l.text.length + 40, 0);
  const lines = [...heard];
  while (total > SUMMARY_CHARS && lines.length > 2) {
    const [cut] = lines.splice(Math.floor(lines.length / 2), 1);
    total -= cut!.text.length + 40;
  }
  return { lines, waiting };
}

/** The language most of a call was heard in, by how much was said in it; else the fallback. */
function languageOfCall(lines: Line[], fallback: string): string {
  const said = new Map<string, number>();
  for (const l of lines)
    if (l.language) {
      const base = baseLanguage(l.language);
      said.set(base, (said.get(base) ?? 0) + l.text.length);
    }
  return [...said].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

/** Who reads the whole call's notes: whoever was in it from before its first heard word. */
async function wholeReaders(ctx: AppContext, call: Call, firstAt: Date): Promise<string[]> {
  const from = await readersOf(ctx.db, call);
  return [...from].filter(([, at]) => at.getTime() <= firstAt.getTime()).map(([id]) => id);
}

const stateOf = (
  ctx: AppContext,
  callId: string,
  state: 'written' | 'none',
  summary?: NotesSummary,
) =>
  ctx.db
    .updateTable('call_note_summaries')
    .set({
      state,
      summary: summary ? JSON.stringify(summary) : null,
      written_at: summary ? ctx.now() : null,
    })
    .where('call_id', '=', callId)
    .execute();

async function writeNotes(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const callId = String(payload.callId ?? '');
  const call = await ctx.db
    .selectFrom('calls')
    .selectAll()
    .where('id', '=', callId)
    .executeTakeFirst();
  const row = await ctx.db
    .selectFrom('call_note_summaries')
    .select(['state', 'written_at', 'requested_at'])
    .where('call_id', '=', callId)
    .executeTakeFirst();
  // Only once it's over, and only while its notes are still there to write from.
  if (call?.state !== 'ended' || !row) return;
  // Asked for again since (words deleted one after another): the latest ask writes them, once.
  const at = Number(payload.at);
  if (Number.isFinite(at) && row.requested_at.getTime() > at) return;
  const { lines, waiting } = await linesOf(ctx, callId);
  if (waiting) return void (await later(ctx, payload, WAIT_MS));
  if (!lines.length) return void (await stateOf(ctx, callId, 'none'));
  // Whoever asked first pays, as for the words themselves (R107): an adult with AI assist on.
  const asker = await ctx.db
    .selectFrom('call_notes')
    .select(['started_by', 'message_id'])
    .where('call_id', '=', callId)
    .where('started_at', 'is not', null)
    .where('started_by', 'is not', null)
    .orderBy('started_at')
    .executeTakeFirst();
  if (!asker?.started_by) return void (await stateOf(ctx, callId, 'none'));
  let made: NotesSummary;
  try {
    const { ai, me, plan } = await aiGate(ctx, asker.started_by);
    const { time, day } = transcriptClock(me.time_zone);
    const transcript = {
      text: transcriptText(lines.map((l) => ({ who: l.speaker, words: l.text, at: time(l.at) }))),
      newFrom: null,
    };
    const language = languageName(languageOfCall(lines, await languageOf(ctx, asker.started_by)));
    made = await runAi(ctx, 'notes-summary', asker.started_by, () =>
      ai.callNotes({
        transcript,
        language,
        today: day(ctx.now()),
        tier: PERSON_ALLOWANCES[plan].aiModel,
      }),
    );
  } catch (err) {
    // The model busy, or the asker's hour of AI assist used up: a while later. Anything else
    // (assist off since, the day spent, a refusal): there are no notes to read but the words.
    if (err instanceof AppError && err.code === 'ai_busy')
      return void (await later(ctx, payload, BUSY_MS));
    if (err instanceof AppError && err.status === 429)
      return void (await later(ctx, payload, RATE_MS));
    if (!(err instanceof AppError)) ctx.log.warn({ err, callId }, 'call notes not written');
    return void (await stateOf(ctx, callId, 'none'));
  }
  await stateOf(ctx, callId, 'written', made);
  const readers = await wholeReaders(ctx, call, lines[0]!.at);
  // Everyone who heard it all reads them and is told; what Cai draws from them is offered only to
  // whoever has AI assist on, as anything Cai finds for them is (M16 F7d).
  const assisted = new Set(
    readers.length
      ? (
          await ctx.db
            .selectFrom('users')
            .select('id')
            .where('id', 'in', readers)
            .where('ai_enabled', '=', true)
            .execute()
        ).map((u) => u.id)
      : [],
  );
  await offerSteps(ctx, call, asker, lines, made, readers, assisted);
  // Told once, when they're first written: a line deleted since writes them again, unannounced.
  if (!row.written_at) await tellWritten(ctx, call, lines, readers);
  const everyone = [...(await readersOf(ctx.db, call)).keys()];
  if (everyone.length)
    await ctx.bus.publish(everyone, { type: 'callnotes.changed', data: { callId } });
}

/**
 * Each next step its person's to take: offered as their suggestion by the line it came from, in
 * their language; in a call of two, the other waits on it; a decision, the asker's to record. Only
 * to someone who heard the whole call (R85 (2)), only to a person on Caime with AI assist on
 * (`offered`), and as Cai's own initiative, which their setting may hold back (R66): the notes
 * were asked for, the suggestions weren't.
 */
async function offerSteps(
  ctx: AppContext,
  call: Call,
  asker: { started_by: string | null; message_id: string | null },
  lines: Line[],
  made: NotesSummary,
  readers: string[],
  offered: Set<string>,
): Promise<void> {
  if (!readers.length) return;
  const people = await ctx.db
    .selectFrom('users')
    .select(['id', 'display_name', 'time_zone', 'locale', 'workweek', 'kind'])
    .where('id', 'in', readers)
    .execute();
  const humans = people.filter((p) => p.kind === 'human');
  const byId = new Map(humans.map((p) => [p.id, p]));
  /** Whom the model named, among those who heard it all: by their whole name, else their first. */
  const named = (who: string | null): string | null => {
    if (!who) return null;
    const w = who.trim().toLocaleLowerCase();
    const exact = humans.filter((p) => p.display_name.toLocaleLowerCase() === w);
    if (exact.length === 1) return exact[0]!.id;
    const first = humans.filter((p) => firstName(p.display_name).toLocaleLowerCase() === w);
    return first.length === 1 ? first[0]!.id : null;
  };
  const quote = (at: Line, readerId: string) =>
    tr('{speaker} said {quote}', {
      speaker: at.speakerId === readerId ? tr('You') : firstName(at.speaker),
      quote: `“${previewText(at.text, 100)}”`,
    });
  for (const step of made.nextSteps) {
    const at = lines[step.line - 1];
    const owner = named(step.who);
    if (!at || !owner) continue;
    const who = byId.get(owner)!;
    // In a call of two the other one waits on it, as a promise in their chat makes them.
    const other = call.is_group ? undefined : readers.find((id) => id !== owner && byId.has(id));
    if (!offered.has(owner) && !(other && offered.has(other))) continue;
    const when = step.due
      ? firstFutureWhen(step.due, {
          now: at.at,
          timeZone: who.time_zone,
          locale: who.locale,
          workweek: who.workweek ?? undefined,
        })
      : undefined;
    const due = { dueAt: when?.at ?? null, dueText: when ? step.due : null };
    if (offered.has(owner))
      await asReader(ctx, owner, () =>
        createSuggestion(ctx, {
          userId: owner,
          kind: 'task',
          title: step.what,
          rationale: () => quote(at, owner),
          confidence: 0.8,
          payload: { source: 'ai', dueHasTime: Boolean(when?.time) },
          subjectUserId: null,
          conversationId: call.conversation_id,
          messageId: asker.message_id,
          ...due,
          fingerprint: `ai:callnote:${at.id}:task`,
        }),
      );
    if (other && offered.has(other))
      await asReader(ctx, other, () =>
        createSuggestion(ctx, {
          userId: other,
          kind: 'waiting',
          title: step.what,
          rationale: () => quote(at, other),
          confidence: 0.8,
          payload: { source: 'ai', dueHasTime: Boolean(when?.time) },
          subjectUserId: owner,
          conversationId: call.conversation_id,
          messageId: asker.message_id,
          ...due,
          fingerprint: `ai:callnote:${at.id}:waiting`,
        }),
      );
  }
  const recorder = asker.started_by;
  if (!recorder || !byId.has(recorder) || !offered.has(recorder)) return;
  for (const d of made.decisions) {
    const at = lines[d.line - 1];
    if (!at) continue;
    await asReader(ctx, recorder, () =>
      createSuggestion(ctx, {
        userId: recorder,
        kind: 'decision',
        title: d.text,
        rationale: () => quote(at, recorder),
        confidence: 0.8,
        payload: { source: 'ai', decidedBy: at.speakerId },
        subjectUserId: null,
        conversationId: call.conversation_id,
        messageId: asker.message_id,
        dueAt: null,
        dueText: null,
        fingerprint: `ai:callnote:${at.id}:decision`,
      }),
    );
  }
}

/** Whoever heard it all is told once, in their own language, that the notes are there. */
async function tellWritten(ctx: AppContext, call: Call, lines: Line[], readers: string[]) {
  const names = new Map<string, string>();
  for (const l of lines) names.set(l.speakerId, l.speaker);
  for (const userId of readers) {
    const others = [...names].filter(([id]) => id !== userId).map(([, n]) => firstName(n));
    await notify(ctx, {
      userId,
      kind: 'call',
      level: 'activity',
      title: () => tr('Cai'),
      body: () =>
        others.length === 1
          ? tr('Your notes from the call with {name} are ready.', { name: others[0]! })
          : tr('Your notes from the call are ready.'),
      data: { conversationId: call.conversation_id, callId: call.id },
      groupKey: `callnotes:${call.id}`,
    });
  }
}

/**
 * Someone deleted their own words from a call's notes: whatever was drawn from them and not yet
 * answered goes, and the notes are written again without them.
 */
export async function afterLineDeleted(ctx: AppContext, call: Call, lineId: string): Promise<void> {
  await ctx.db
    .updateTable('suggestions')
    .set({ status: 'expired', resolved_at: ctx.now() })
    .where('status', '=', 'pending')
    .where('fingerprint', 'like', `ai:callnote:${lineId}:%`)
    .execute();
  const row = await ctx.db
    .selectFrom('call_note_summaries')
    .select('state')
    .where('call_id', '=', call.id)
    .executeTakeFirst();
  if (row && call.state === 'ended') await queueNotesSummary(ctx, call, { again: true });
}

/** The notes as their reader sees them: the whole call's, for whoever was in it for all of it. */
export async function summaryFor(
  ctx: AppContext,
  call: Call,
  viewerId: string,
): Promise<{
  summary: CallNotesSummaryView | null;
  summaryState: 'writing' | 'written' | 'none' | null;
}> {
  const row = await ctx.db
    .selectFrom('call_note_summaries')
    .select(['state', 'summary'])
    .where('call_id', '=', call.id)
    .executeTakeFirst();
  if (!row) return { summary: null, summaryState: null };
  const first = await ctx.db
    .selectFrom('call_note_lines as l')
    .innerJoin('call_notes as n', 'n.id', 'l.notes_id')
    .select(sql<Date>`min(l.spoken_at)`.as('at'))
    .where('n.call_id', '=', call.id)
    .executeTakeFirst();
  const from = (await readersOf(ctx.db, call)).get(viewerId);
  if (!from || (first?.at && from.getTime() > new Date(first.at).getTime()))
    return { summary: null, summaryState: null };
  const s = row.summary as NotesSummary | null;
  return {
    summaryState: row.state as 'writing' | 'written' | 'none',
    summary:
      row.state === 'written' && s
        ? {
            summary: s.summary,
            topics: s.topics,
            decisions: s.decisions.map((d) => d.text),
            nextSteps: s.nextSteps.map((n) => ({ who: n.who, what: n.what, due: n.due })),
            label: AI_LABEL,
          }
        : null,
  };
}

export function registerNotesSummaryJob(): void {
  registerJob(SUMMARY_JOB, writeNotes);
}
