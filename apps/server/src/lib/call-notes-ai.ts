/**
 * Cai on a call's notes, on ask (M16 F7d; R82 (3), R12): a catch-up of what the reader may read of
 * them (`notesFor`: from when they joined, each heard line by its speaker, the reader's own as
 * "You") and the follow-ups in it, each offered as the reader's own suggestion by the line it came
 * from. They're read as a conversation is, by the same instructions as a conversation's catch-up
 * and follow-ups; the catch-up is kept nowhere, and nothing is drawn from the notes unless asked.
 */
import {
  AI_LABEL,
  type AiActionsView,
  type AiCatchUpView,
  firstFutureWhen,
  firstName,
  PERSON_ALLOWANCES,
  previewText,
  truncate,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import { languageName, type Transcript } from './ai';
import { aiGate } from './ai-gate';
import { runAi } from './ai-run';
import { notesFor } from './call-notes';
import { languageOf } from './i18n';
import { createSuggestion, suggestionView } from './suggest';
import { transcriptClock, transcriptText } from './transcript';

/** A line is at most half a minute of speech; the transcript at most this much of the call. */
const LINE_CHARS = 800;
const NOTES_CHARS = 24_000;

interface NoteLine {
  id: string;
  speakerId: string;
  speaker: string;
  mine: boolean;
  text: string;
  at: Date;
}

/** What the reader may read of the notes, newest kept within the budget, numbered oldest first. */
async function noteTranscript(
  ctx: AppContext,
  call: Call,
  viewerId: string,
  timeZone: string,
): Promise<{ transcript: Transcript; lines: NoteLine[] }> {
  const { lines } = await notesFor(ctx, call, viewerId);
  const heard = lines.flatMap((l) =>
    l.text
      ? [
          {
            id: l.id,
            speakerId: l.speaker.id,
            speaker: l.speaker.displayName,
            mine: l.mine,
            text: truncate(l.text.replace(/\s+/g, ' ').trim(), LINE_CHARS),
            at: new Date(l.at),
          },
        ]
      : [],
  );
  const kept: NoteLine[] = [];
  let budget = NOTES_CHARS;
  for (let i = heard.length - 1; i >= 0 && budget > 0; i--) {
    const line = heard[i]!;
    budget -= line.text.length + 40;
    kept.unshift(line);
  }
  const { time } = transcriptClock(timeZone);
  return {
    transcript: {
      text: transcriptText(
        kept.map((l) => ({ who: l.mine ? 'You' : l.speaker, words: l.text, at: time(l.at) })),
      ),
      newFrom: null,
    },
    lines: kept,
  };
}

const quoted = (s: string, max = 100) => `“${previewText(s, max)}”`;

/** "Catch me up" on a call's notes: what the reader needs to know of it, said in their language. */
export async function catchUpOnNotes(
  ctx: AppContext,
  call: Call,
  userId: string,
): Promise<AiCatchUpView> {
  const { ai, me } = await aiGate(ctx, userId);
  const { transcript, lines } = await noteTranscript(ctx, call, userId, me.time_zone);
  // A call's notes are read whole: nothing new is left out (M17 I3).
  if (!lines.length) return { summary: null, label: null, newCount: 0, unread: 0 };
  const language = languageName(await languageOf(ctx, userId));
  const summary = await runAi(ctx, 'notes-catch-up', userId, () =>
    ai.catchUp({
      transcript,
      language,
      today: transcriptClock(me.time_zone).day(ctx.now()),
    }),
  );
  return { summary, label: AI_LABEL, newCount: 0, unread: 0 };
}

/**
 * "Find follow-ups" in a call's notes: what the reader agreed or was asked to do, what they wait
 * on someone in the call for, and what was decided, each the reader's suggestion by its line
 * (once: a line's follow-up offered or dismissed before isn't offered again), tied to the call's
 * line in its conversation.
 */
export async function findNoteFollowUps(
  ctx: AppContext,
  call: Call,
  userId: string,
): Promise<AiActionsView> {
  const { ai, me, plan } = await aiGate(ctx, userId);
  const { transcript, lines } = await noteTranscript(ctx, call, userId, me.time_zone);
  if (!lines.length) return { found: [], label: AI_LABEL };
  const items = await runAi(ctx, 'notes-actions', userId, () =>
    ai.findActions({
      transcript,
      today: transcriptClock(me.time_zone).day(ctx.now()),
      tier: PERSON_ALLOWANCES[plan].aiModel,
    }),
  );
  const line = await ctx.db
    .selectFrom('call_notes')
    .select('message_id')
    .where('call_id', '=', call.id)
    .where('message_id', 'is not', null)
    .executeTakeFirst();
  // Who a "waiting" item names, among the others who spoke.
  const others = new Map<string, string>();
  for (const l of lines) if (!l.mine) others.set(l.speakerId, l.speaker);
  const named = (who: string | null): string | null => {
    if (!who) return null;
    const w = who.toLocaleLowerCase();
    const match = (pick: (name: string) => string) =>
      [...others].filter(([, name]) => pick(name).toLocaleLowerCase() === w);
    const exact = match((n) => n);
    if (exact.length === 1) return exact[0]![0];
    const first = match(firstName);
    return first.length === 1 ? first[0]![0] : null;
  };
  const created: string[] = [];
  for (const item of items) {
    const at = lines[item.line - 1];
    if (!at) continue;
    let subject: string | null = null;
    if (item.kind === 'waiting') {
      subject =
        named(item.who) ??
        (at.mine ? null : at.speakerId) ??
        (others.size === 1 ? [...others.keys()][0]! : null);
      if (!subject) continue;
    }
    const when =
      item.kind !== 'decision' && item.due
        ? firstFutureWhen(item.due, {
            now: at.at,
            timeZone: me.time_zone,
            locale: me.locale,
            workweek: me.workweek,
          })
        : undefined;
    const speaker = at.mine ? tr('You') : firstName(at.speaker);
    const id = await createSuggestion(ctx, {
      userId,
      kind: item.kind,
      title: item.title,
      rationale: tr('{speaker} said {quote}', { speaker, quote: quoted(at.text) }),
      confidence: 0.8,
      asked: true,
      payload: {
        source: 'ai',
        dueHasTime: Boolean(when?.time),
        ...(item.kind === 'decision' ? { decidedBy: at.speakerId } : {}),
      },
      subjectUserId: subject,
      conversationId: call.conversation_id,
      messageId: line?.message_id ?? null,
      dueAt: when?.at ?? null,
      dueText: when ? item.due : null,
      fingerprint: `ai:callnote:${at.id}:${item.kind}`,
    });
    if (id) created.push(id);
  }
  const found = created.length
    ? await ctx.db
        .selectFrom('suggestions')
        .selectAll()
        .where('id', 'in', created)
        .orderBy('created_at')
        .execute()
    : [];
  return { found: found.map(suggestionView), label: AI_LABEL };
}
