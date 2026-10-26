/**
 * A meeting that changes, and everyone's own answer to it (R123). Its organizer changes it from
 * its card: what it's called and whether Cai takes notes (what), when it is, how long, how it
 * repeats (when), or where (where). A change to when or where asks everyone again, as a
 * calendar's new SEQUENCE does (RFC 5545 §3.8.7.4; where, Caime's own rule: it decides whether
 * someone can come); a change to what tells them and keeps every answer (RFC 5546 §2.1.5, the
 * same SEQUENCE with a later stamp). In a group each person answers for themselves, Going or Not
 * going, kept on the card for the round it was asked in; between two people the card's own Accept
 * and Decline are the answer. Pure: the server keeps it, the card and the conversation's top line
 * read it.
 */
import { isLargeGroup } from './large-group';

/** What a meeting's organizer may change on it, and which kind of change each is. */
export const MEETING_CHANGES = {
  title: 'what',
  notes: 'what',
  start: 'when',
  durationMinutes: 'when',
  repeat: 'when',
  repeatUntil: 'when',
  place: 'where',
} as const;

export type MeetingField = keyof typeof MEETING_CHANGES;
export type MeetingChange = (typeof MEETING_CHANGES)[MeetingField];

/** For this time of a series alone, or for it and every time after (RFC 5545's THISANDFUTURE). */
export const CHANGE_SCOPES = ['this', 'after'] as const;
export type ChangeScope = (typeof CHANGE_SCOPES)[number];

/** How it repeats changes for every time ahead, never for one. */
export const SERIES_ONLY: readonly MeetingField[] = ['repeat', 'repeatUntil'];

function same(a: unknown, b: unknown): boolean {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    // A time is the same instant, whatever else was written beside it (its zone, R119).
    const x = a as { at?: unknown; hasTime?: unknown };
    const y = b as { at?: unknown; hasTime?: unknown };
    if ('at' in x || 'at' in y)
      return (
        Date.parse(String(x.at)) === Date.parse(String(y.at)) &&
        (x.hasTime !== false) === (y.hasTime !== false)
      );
  }
  return (a ?? null) === (b ?? null);
}

/**
 * What changed between a meeting's fields as they were and as asked: the fields that differ and
 * whether that asks everyone again (`asks`: when or where).
 */
export function meetingChange(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { fields: MeetingField[]; asks: boolean } {
  const fields = (Object.keys(MEETING_CHANGES) as MeetingField[]).filter(
    (key) => !same(before[key], after[key]),
  );
  return { fields, asks: fields.some((key) => MEETING_CHANGES[key] !== 'what') };
}

/** Why a meeting can't be changed from its card, or null when its organizer may (R123). */
export type ChangeBlock = 'kind' | 'state' | 'invitation' | 'moved' | 'over';

export function changeBlock(
  card: {
    kit?: unknown;
    state?: unknown;
    invitation?: unknown;
    movedTo?: unknown;
    fields?: { start?: { at?: unknown } } | null;
  },
  /** When it ends (core `cardEndMs`), and now: one that's over is history. */
  endMs: number | null,
  now: Date,
): ChangeBlock | null {
  if (card.kit !== 'meeting') return 'kind';
  if (card.state !== 'proposed' && card.state !== 'accepted') return 'state';
  if (card.invitation) return 'invitation';
  if (card.movedTo) return 'moved';
  if (endMs !== null && endMs <= now.getTime()) return 'over';
  return null;
}

/** One person's answer in a group, for the round it was given in. */
export interface MeetingAnswerEntry {
  /** Going (`y`) or not (`n`). */
  a: 'y' | 'n';
  /** The round it answers: a change to when or where asks again (one round on). */
  r: number;
  at: string;
  /** Not going, with another time they suggest to its organizer (an instant). */
  s?: string;
}

export type MeetingAnswer = 'going' | 'not_going';

/** Whether a conversation keeps each person's answer: a group, short of a crowd (M16 D2b). */
export function answersKept(conversationKind: string, members: number): boolean {
  return conversationKind === 'group' && !isLargeGroup(conversationKind, members);
}

/** The round a card asks in now. */
export function roundOf(card: { round?: unknown }): number {
  return Number.isInteger(card.round) && (card.round as number) > 0 ? (card.round as number) : 0;
}

function entriesOf(card: { answers?: unknown }): Record<string, MeetingAnswerEntry> {
  const raw = card.answers;
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, MeetingAnswerEntry> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const e = v as Partial<MeetingAnswerEntry> | null;
    if (!e || (e.a !== 'y' && e.a !== 'n') || !Number.isInteger(e.r)) continue;
    out[id] = {
      a: e.a,
      r: e.r as number,
      at: String(e.at ?? ''),
      ...(typeof e.s === 'string' ? { s: e.s } : {}),
    };
  }
  return out;
}

/** This person's answer to the card as it stands now, or null: none, or one to an older time. */
export function answerOf(
  card: { answers?: unknown; round?: unknown },
  userId: string,
): MeetingAnswer | null {
  const e = entriesOf(card)[userId];
  if (!e || e.r !== roundOf(card)) return null;
  return e.a === 'y' ? 'going' : 'not_going';
}

/** Who among `people` is going, isn't, and hasn't answered yet, in this round. */
export function answersAmong(
  card: { answers?: unknown; round?: unknown },
  people: readonly string[],
): {
  going: string[];
  notGoing: string[];
  waiting: string[];
  /** Times suggested by those not going, soonest first. */
  suggested: Array<{ userId: string; at: string }>;
} {
  const round = roundOf(card);
  const entries = entriesOf(card);
  const going: string[] = [];
  const notGoing: string[] = [];
  const waiting: string[] = [];
  const suggested: Array<{ userId: string; at: string }> = [];
  for (const id of people) {
    const e = entries[id];
    if (!e || e.r !== round) waiting.push(id);
    else if (e.a === 'y') going.push(id);
    else {
      notGoing.push(id);
      if (e.s && Number.isFinite(Date.parse(e.s))) suggested.push({ userId: id, at: e.s });
    }
  }
  suggested.sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  return { going, notGoing, waiting, suggested };
}

/** How many said they're going in this round. */
export function goingCount(card: { answers?: unknown; round?: unknown }): number {
  const round = roundOf(card);
  return Object.values(entriesOf(card)).filter((e) => e.r === round && e.a === 'y').length;
}

/**
 * Where a group's meeting stands from its people's answers (its organizer counts as going): on
 * once anyone else says yes, declined once everyone else said no, asked until then.
 */
export function stateByAnswers(
  card: { answers?: unknown; round?: unknown },
  others: readonly string[],
): 'proposed' | 'accepted' | 'declined' {
  const { going, notGoing } = answersAmong(card, others);
  if (going.length) return 'accepted';
  if (others.length && notGoing.length === others.length) return 'declined';
  return 'proposed';
}
