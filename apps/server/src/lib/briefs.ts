/**
 * The brief before a meeting (R58): what Caime already remembers of the two of you, gathered
 * an hour before an agreed meeting or appointment and read from the card. Rules first: the
 * decisions, the promises open either way, the questions left unanswered, the files shared and
 * what was said since the last such card; a bounded model summary of the conversation since
 * then only when the reader has AI assist on and an allowance left (ADR-12), through `runAi`.
 * For work, customers, vendors and professionals, never family or friends; never from a private
 * conversation; nothing written anywhere but the reader's own notification, in their language.
 */
import {
  AI_LABEL,
  type AnswerSourceView,
  type BriefView,
  KITS,
  type Sphere,
  tr,
  trn,
  truncate,
} from '@caime/core';
import { initiativeOf, tellsBeforeMeetings } from '@caime/core/initiative';
import { AGREED_STATES as AGREED } from '@caime/core/kit-states';
import { SPACE_KIND_DEFS, type SpaceKind } from '@caime/core/spaces';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import { languageName } from './ai';
import { runAi } from './ai-run';
import { countAnswer } from './answers';
import { customerMask, maskFor } from './business';
import { membership } from './conversation-views';
import { dueAtForSql } from './due';
import { AppError } from './errors';
import { languageOf } from './i18n';
import { enqueue, registerJob } from './jobs';
import { messagePreview, readableBy } from './messages';
import { notify } from './notify';
import { assertAiAllowance } from './plans';
import { activeRelationships } from './relations';
import { visibleTasksSql } from './task-visibility';
import { transcriptClock, transcriptText, wordsFor } from './transcript';
import { TtlCache } from './ttl-cache';
import { minorOf } from './users';

export const BRIEF_LEAD_MS = 60 * 60_000;
/** The relationships a brief is for: the ones that are a report, not a family dinner. */
export const BRIEF_SPHERES: readonly Sphere[] = [
  'work',
  'customer',
  'vendor',
  'service_provider',
  'professional',
];
const BRIEF_JOB = 'card.brief';
const EACH = 8;
/** How far back a brief looks without an earlier card to start from. */
const LOOKBACK_MS = 14 * 86_400_000;
/** The model reads at most this many lines of the conversation since then. */
const SUMMARY_LINES = 40;
const SUMMARY_TTL_MS = 10 * 60_000;

interface CardRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  payload: {
    kit?: string;
    title?: string;
    state?: string;
    fields?: { start?: { at?: string; hasTime?: boolean } };
    booking?: { providerId?: string | null } | null;
  };
}

async function cardOf(ctx: AppContext, messageId: string): Promise<CardRow | null> {
  const row = await ctx.db
    .selectFrom('messages')
    .select(['id', 'conversation_id', 'sender_id', 'payload', 'kind', 'deleted_at'])
    .where('id', '=', messageId)
    .executeTakeFirst();
  if (row?.kind !== 'kit' || row.deleted_at) return null;
  const payload = (row.payload ?? {}) as CardRow['payload'];
  if (payload.kit !== 'meeting' && payload.kit !== 'appointment') return null;
  return { id: row.id, conversation_id: row.conversation_id, sender_id: row.sender_id, payload };
}

const startOf = (card: CardRow): Date | null => {
  const at = card.payload.fields?.start?.at;
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const isAgreed = (card: CardRow) =>
  card.payload.state === (AGREED as Record<string, string | undefined>)[card.payload.kit ?? ''];

/**
 * An agreed card ahead gets its brief an hour before (now, if it's sooner than that); one job
 * per card and start, so a card moved to another time gets another, and the old one finds the
 * card elsewhere and does nothing.
 */
export async function queueBrief(ctx: AppContext, messageId: string): Promise<void> {
  const card = await cardOf(ctx, messageId);
  const start = card ? startOf(card) : null;
  if (!card || !start || !isAgreed(card) || start.getTime() <= ctx.now().getTime()) return;
  const runAt = new Date(Math.max(ctx.now().getTime(), start.getTime() - BRIEF_LEAD_MS));
  await enqueue(
    ctx,
    BRIEF_JOB,
    { messageId, at: start.toISOString() },
    { runAt, dedupeKey: `brief:${messageId}:${start.toISOString()}`, maxAttempts: 2 },
  );
}

/**
 * Who in the conversation gets a brief: by their own relationship to the other side. In a
 * group, what it's for says: a space's kind (a team's or a project's, everyone in it; a
 * family's or a community's, nobody), else each one's own label for whoever called it, and
 * whoever called it when anyone in it is work to them.
 */
async function readersOf(ctx: AppContext, card: CardRow): Promise<string[]> {
  const conversation = await ctx.db
    .selectFrom('conversations as c')
    .leftJoin('spaces as s', 's.id', 'c.space_id')
    .select(['c.kind', 'c.privacy_class', 's.kind as space_kind'])
    .where('c.id', '=', card.conversation_id)
    .executeTakeFirst();
  if (conversation?.privacy_class !== 'standard') return [];
  if (!['direct', 'business', 'group'].includes(conversation.kind)) return [];
  const people = await ctx.db
    .selectFrom('participants as p')
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .select(['p.user_id'])
    .where('p.conversation_id', '=', card.conversation_id)
    .where('p.left_at', 'is', null)
    .where('u.kind', '=', 'human')
    .where('u.deleted_at', 'is', null)
    .where((eb) =>
      eb.or([eb('p.request_state', 'is', null), eb('p.request_state', '=', 'accepted')]),
    )
    .execute();
  const ids = people.map((p) => p.user_id);
  if (conversation.kind === 'business') {
    // The customer, and on the team whoever does it (or has the conversation): nobody else.
    const mask = await customerMask(ctx.db, card.conversation_id);
    if (!mask) return [];
    const thread = await ctx.db
      .selectFrom('business_threads')
      .select('assignee_id')
      .where('conversation_id', '=', card.conversation_id)
      .executeTakeFirst();
    const doer = card.payload.booking?.providerId ?? thread?.assignee_id ?? null;
    return ids.filter((id) => id === mask.customerId || id === doer);
  }
  if (conversation.kind === 'group')
    return groupReaders(ctx, ids, card.sender_id, conversation.space_kind);
  const out: string[] = [];
  for (const id of ids) {
    const other = ids.find((x) => x !== id);
    if (!other) continue;
    const rels = await activeRelationships(ctx.db, id, [other]);
    if (rels.some((r) => BRIEF_SPHERES.includes(r.sphere as Sphere))) out.push(id);
  }
  return out;
}

/** A group's readers (R58): by its space's kind, else by each one's tie to its organizer. */
async function groupReaders(
  ctx: AppContext,
  ids: string[],
  organizer: string | null,
  spaceKind: SpaceKind | null,
): Promise<string[]> {
  if (spaceKind) {
    const sphere = SPACE_KIND_DEFS[spaceKind]?.sphere;
    return sphere && BRIEF_SPHERES.includes(sphere) ? ids : [];
  }
  if (!organizer || !ids.includes(organizer)) return [];
  const others = ids.filter((id) => id !== organizer);
  if (!others.length) return [];
  // Both ways at once, one query: each one's label for the organizer, and the organizer's.
  const rels = await ctx.db
    .selectFrom('relationships')
    .select(['owner_id', 'subject_id', 'sphere'])
    .where('status', '=', 'active')
    .where('sphere', 'in', [...BRIEF_SPHERES])
    .where((eb) =>
      eb.or([
        eb.and([eb('owner_id', 'in', others), eb('subject_id', '=', organizer)]),
        eb.and([eb('owner_id', '=', organizer), eb('subject_id', 'in', others)]),
      ]),
    )
    .execute();
  const readers = new Set(rels.filter((r) => r.subject_id === organizer).map((r) => r.owner_id));
  if (rels.some((r) => r.owner_id === organizer)) readers.add(organizer);
  return ids.filter((id) => readers.has(id));
}

async function briefJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const messageId = String(payload.messageId);
  const card = await cardOf(ctx, messageId);
  const start = card ? startOf(card) : null;
  // Moved, cancelled or gone: nothing to say about it now.
  if (!card || !start || !isAgreed(card) || start.toISOString() !== String(payload.at)) return;
  if (start.getTime() <= ctx.now().getTime() - BRIEF_LEAD_MS) return;
  const readers = await readersOf(ctx, card);
  // Told only those who let Cai say things unasked (R66: not with "Less"); one read for them all.
  const told = readers.length
    ? await ctx.db
        .selectFrom('users')
        .select(['id', 'preferences'])
        .where('id', 'in', readers)
        .execute()
    : [];
  const quiet = new Set(
    told.filter((u) => !tellsBeforeMeetings(initiativeOf(u.preferences))).map((u) => u.id),
  );
  for (const userId of readers) {
    if (quiet.has(userId)) continue;
    const brief = await briefFor(ctx, userId, messageId, { withModel: false }).catch(() => null);
    if (!brief) continue;
    await notify(ctx, {
      userId,
      kind: 'brief',
      level: 'activity',
      title: () => tr('Coming up: {title}', { title: brief.title }),
      body: () => briefLine(brief),
      groupKey: `brief:${messageId}`,
      data: { conversationId: card.conversation_id, messageId, brief: true },
    });
  }
}

/** "2 decisions · 1 promise open · 3 questions unanswered · 2 files", or that nothing is open. */
export function briefLine(
  b: Pick<BriefView, 'decisions' | 'promises' | 'questions' | 'files'>,
): string {
  const parts = [
    b.decisions.length ? trn(b.decisions.length, '{n} decision', '{n} decisions') : null,
    b.promises.length ? trn(b.promises.length, '{n} promise open', '{n} promises open') : null,
    b.questions.length
      ? trn(b.questions.length, '{n} question unanswered', '{n} questions unanswered')
      : null,
    b.files.length ? trn(b.files.length, '{n} file', '{n} files') : null,
  ].filter((x): x is string => Boolean(x));
  return parts.length ? parts.join(' · ') : tr('Nothing open between you since last time.');
}

/** A card's summary for one reader, ten minutes; null is a summary that couldn't be had. */
/** A card's summary with the lines it rests on, for one reader; null is one that couldn't be had. */
type Summed = { text: string; sources: AnswerSourceView[] } | null;
const summaries = new TtlCache<string, Summed>(5_000, SUMMARY_TTL_MS);

/**
 * The brief as the reader sees it: their own view of the conversation (a customer's names the
 * organization), from the last such card or a fortnight back. With `withModel`, a summary of
 * what was said since, when the reader may have one.
 */
export async function briefFor(
  ctx: AppContext,
  userId: string,
  messageId: string,
  opts: { withModel: boolean },
): Promise<BriefView> {
  const card = await cardOf(ctx, messageId);
  if (!card)
    throw new AppError(404, 'not_found', tr('{what} wasn’t found.', { what: tr('That card') }));
  const { conversation } = await membership(ctx, userId, card.conversation_id);
  const start = startOf(card) ?? ctx.now();
  const kit = card.payload.kit as 'meeting' | 'appointment';
  const previous = await ctx.db
    .selectFrom('messages')
    .select('card_start_at as at')
    .where('conversation_id', '=', card.conversation_id)
    .where('kind', '=', 'kit')
    .where('deleted_at', 'is', null)
    .where('id', '<>', card.id)
    .where(sql`payload->>'kit'`, 'in', ['meeting', 'appointment'])
    .where((eb) =>
      eb.or([
        eb.and([
          eb(sql`payload->>'kit'`, '=', 'meeting'),
          eb(sql`payload->>'state'`, '=', 'accepted'),
        ]),
        eb.and([
          eb(sql`payload->>'kit'`, '=', 'appointment'),
          eb(sql`payload->>'state'`, '=', 'confirmed'),
        ]),
      ]),
    )
    .where('card_start_at', '<', start)
    .orderBy('card_start_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  const since = previous?.at
    ? previous.at
    : new Date(Math.min(ctx.now().getTime(), start.getTime()) - LOOKBACK_MS);
  const others = await ctx.db
    .selectFrom('participants')
    .select('user_id')
    .where('conversation_id', '=', card.conversation_id)
    .where('user_id', '<>', userId)
    .where('left_at', 'is', null)
    .execute();
  const otherIds = others.map((o) => o.user_id);
  const [decided, mine, theirs, lastMine, asked, files, count] = await Promise.all([
    ctx.db
      .selectFrom('decisions')
      .select(['id', 'title', 'decided_at'])
      .where('conversation_id', '=', card.conversation_id)
      .where('status', '=', 'active')
      .where('decided_at', '>=', since)
      .orderBy('decided_at', 'desc')
      .limit(EACH)
      .execute(),
    ctx.db
      .selectFrom('tasks')
      .select(['id', 'title', dueAtForSql(userId).as('due_at')])
      .where('conversation_id', '=', card.conversation_id)
      .where('assignee_id', '=', userId)
      .where(visibleTasksSql(userId))
      .where('status', 'in', ['open', 'accepted'])
      .orderBy(sql`due_at asc nulls last`)
      .limit(EACH)
      .execute(),
    otherIds.length
      ? ctx.db
          .selectFrom('tasks')
          .select(['id', 'title', dueAtForSql(userId).as('due_at')])
          .where('conversation_id', '=', card.conversation_id)
          .where('owner_id', '=', userId)
          .where('assignee_id', 'in', otherIds)
          .where('status', 'in', ['open', 'accepted'])
          .orderBy(sql`due_at asc nulls last`)
          .limit(EACH)
          .execute()
      : [],
    ctx.db
      .selectFrom('messages')
      .select(sql<string | null>`max(seq)`.as('seq'))
      .where('conversation_id', '=', card.conversation_id)
      .where('sender_id', '=', userId)
      // A card posted isn't an answer; words are.
      .where('kind', 'not in', ['system', 'kit'])
      .executeTakeFirst(),
    ctx.db
      .selectFrom('messages')
      .select(MESSAGE_COLUMNS)
      .where('conversation_id', '=', card.conversation_id)
      .where('is_question', '=', true)
      // What the reader may read (`readableBy`): never what they deleted for themselves.
      .where(readableBy(userId, ctx.now()))
      .where('created_at', '>=', since)
      .where((eb) => eb.or([eb('sender_id', 'is', null), eb('sender_id', '<>', userId)]))
      .orderBy('seq', 'desc')
      .limit(EACH)
      .execute(),
    ctx.db
      .selectFrom('message_files as mf')
      .innerJoin('messages as m', 'm.id', 'mf.message_id')
      .innerJoin('files as f', 'f.id', 'mf.file_id')
      .select(['f.id', 'f.name', 'f.kind'])
      .where('m.conversation_id', '=', card.conversation_id)
      .where(readableBy(userId, ctx.now(), 'm'))
      .where('m.created_at', '>=', since)
      .orderBy('m.seq', 'desc')
      .limit(EACH)
      .execute(),
    ctx.db
      .selectFrom('messages')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('conversation_id', '=', card.conversation_id)
      .where('kind', 'not in', ['system', 'kit'])
      .where(readableBy(userId, ctx.now()))
      .where('created_at', '>=', since)
      .executeTakeFirstOrThrow(),
  ]);
  const myLast = Number(lastMine?.seq ?? 0);
  const questions = (asked as Message[])
    .filter((m) => Number(m.seq) > myLast)
    .map((m) => ({
      messageId: m.id,
      preview: truncate(messagePreview(m), 120),
      at: m.created_at.toISOString(),
    }));
  const brief: BriefView = {
    messageId: card.id,
    conversationId: card.conversation_id,
    kit,
    title: card.payload.title || tr(KITS[kit].name),
    at: start.toISOString(),
    since: since.toISOString(),
    messages: count.n,
    decisions: decided.map((d) => ({
      id: d.id,
      title: d.title,
      decidedAt: d.decided_at.toISOString(),
    })),
    promises: [
      ...mine.map((t) => ({
        id: t.id,
        title: t.title,
        dueAt: t.due_at?.toISOString() ?? null,
        direction: 'mine' as const,
      })),
      ...theirs.map((t) => ({
        id: t.id,
        title: t.title,
        dueAt: t.due_at?.toISOString() ?? null,
        direction: 'theirs' as const,
      })),
    ],
    questions,
    files: files.map((f) => ({ id: f.id, name: f.name, kind: f.kind })),
    summary: null,
    label: null,
    sources: [],
  };
  if (opts.withModel && conversation.privacy_class === 'standard' && count.n > 0) {
    const summary = await summaryFor(ctx, userId, card, since);
    if (summary) {
      brief.summary = summary.text;
      brief.sources = summary.sources;
      brief.label = AI_LABEL;
    }
  }
  return brief;
}

/** A bounded summary of what was said since, for a reader who may have one; cached ten minutes. */
async function summaryFor(
  ctx: AppContext,
  userId: string,
  card: CardRow,
  since: Date,
): Promise<Summed> {
  const ai = ctx.ai;
  if (!ai) return null;
  const key = `${userId}:${card.id}`;
  const cached = summaries.get(key, ctx.now().getTime());
  if (cached !== undefined) return cached;
  const me = await ctx.db
    .selectFrom('users')
    .select(['ai_enabled', 'birth_date', 'time_zone', 'age_minor_until'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  if (!me.ai_enabled || minorOf(me, ctx.now())) return null;
  try {
    await assertAiAllowance(ctx, userId);
  } catch {
    return null;
  }
  const rows = (await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('conversation_id', '=', card.conversation_id)
    .where(readableBy(userId, ctx.now()))
    .where('kind', '<>', 'system')
    .where('created_at', '>=', since)
    .orderBy('seq', 'desc')
    .limit(SUMMARY_LINES)
    .execute()) as Message[];
  if (rows.length === 0) return null;
  const mask = await maskFor(ctx.db, card.conversation_id, userId);
  const senderIds = [...new Set(rows.map((m) => m.sender_id).filter((x): x is string => !!x))];
  const names = new Map(
    (
      await ctx.db
        .selectFrom('users')
        .select(['id', 'display_name'])
        .where('id', 'in', senderIds.length ? senderIds : ['00000000-0000-0000-0000-000000000000'])
        .execute()
    ).map((u) => [u.id, u.display_name]),
  );
  // As every model reads a conversation (`lib/transcript.ts`): with each line's time on the
  // reader's clock, as the catch-up's prompt says its lines are.
  const { time, day } = transcriptClock(me.time_zone || 'UTC');
  const lines = rows.reverse().map((m) => ({
    at: time(m.created_at),
    who:
      m.sender_id === userId
        ? 'You'
        : mask && m.sender_id !== mask.customerId
          ? mask.orgName
          : (names.get(m.sender_id ?? '') ?? 'Someone'),
    words: wordsFor(m, 400),
  }));
  const language = languageName(await languageOf(ctx, userId));
  const caught = await runAi(ctx, 'brief', userId, () =>
    ai.catchUp({
      transcript: { text: transcriptText(lines), newFrom: null },
      language,
      today: day(ctx.now()),
    }),
  ).catch(() => null);
  if (!caught) {
    summaries.set(key, null, ctx.now().getTime());
    return null;
  }
  // The lines it rests on, each a tap to its message (M17 I4): `rows` is oldest first here.
  const seen = new Set<string>();
  const sources: AnswerSourceView[] = [];
  for (const n of caught.sources) {
    const m = rows[n - 1];
    const line = lines[n - 1];
    if (!m || !line || seen.has(m.id)) continue;
    seen.add(m.id);
    sources.push({
      kind: 'message',
      conversationId: card.conversation_id,
      messageId: m.id,
      seq: Number(m.seq),
      title: null,
      who: line.who,
      at: m.created_at.toISOString(),
    });
  }
  countAnswer(ctx, 'brief', sources.length);
  const summary = { text: caught.summary, sources };
  summaries.set(key, summary, ctx.now().getTime());
  return summary;
}

export function registerBriefJob(): void {
  registerJob(BRIEF_JOB, briefJob);
}
