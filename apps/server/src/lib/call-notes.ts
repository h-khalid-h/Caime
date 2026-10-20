/**
 * Cai takes notes in a call (M16 F7; R82 phase 1 under R85, R52's rules). Someone in the call
 * asks; it's on once everyone in the call has said yes, each by a labelled choice (R85 (1)); it
 * stops for everyone, from that moment, at anyone's no (a Stop, a ring answered or a call joined
 * without Cai: R85 (2)); never with anyone under 18 in the call (R85 (3)), never in a private
 * conversation (R52). One member's browser in the call records (R85 (4)): each voice on its own
 * track, each utterance sent as it ends (`saveLine`), heard by the speech provider in a job of its
 * own (`call.note`) on the asker's allowance (R107), its audio deleted once heard (R85 (5)).
 * Whoever was in the call reads what was said from when they joined, and may delete their own.
 *
 * Whether it's on is decided in one place, `reconcileNotes`, under the notes' row lock, from the
 * call as it is: after an ask, an answer or a stop here, a 1:1 call answered or ended, and any
 * change to who's in a group call (`settleGroupCall`, a join). Nothing else moves its state.
 */
import {
  type CallNoteLineView,
  type CallNotesResponse,
  type CallNotesView,
  type CallNotesWhy,
  tr,
  uuidv7,
} from '@caime/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Call, Database } from '../db/schema';
import { AiError } from './ai';
import { runAi } from './ai-run';
import { audioLengthMs } from './audio-length';
import { AppError, forbidden, notFound } from './errors';
import { dropUnusedFiles, removeStored, storeBytes } from './files';
import { enqueue, registerJob } from './jobs';
import { participantsOf } from './messages';
import { assertNotesAllowed } from './notes-allowed';
import { personViewsFor } from './people-batch';
import { assertAiAllowance } from './plans';
import { storageFor } from './storage';
import { anyMinor } from './users';

type Db = Kysely<Database> | Transaction<Database>;

export const NOTE_JOB = 'call.note';
/** An utterance longer than this is cut by the recorder; a little over it is refused here. */
export const LINE_MAX_MS = 30_000;
const LINE_SLACK_MS = 5_000;
/** Shorter than this, a model invents words in near-silence (R82 (2)): never heard. */
export const LINE_MIN_MS = 500;
/** An utterance's bytes: half a minute of speech, compressed, with room to spare. */
export const LINE_MAX_BYTES = 2 * 1024 * 1024;
/** The kinds of audio a browser records an utterance in. */
export const LINE_TYPES: readonly string[] = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'];

/** Someone whose yes the notes need, on the device they're in the call on (null: not yet). */
interface Asked {
  userId: string;
  device: string | null;
}

/**
 * Whose yes the notes need: a 1:1 call's two people from the start (the one called answers with
 * Cai or without, R85 (1)); a group call's joined members (whoever joins later chooses as they
 * join). Nobody once it has ended.
 */
async function askedIn(db: Db, call: Call): Promise<Asked[]> {
  if (call.state === 'ended') return [];
  if (!call.is_group) {
    const people: Asked[] = [];
    if (call.caller_id) people.push({ userId: call.caller_id, device: call.caller_device });
    if (call.callee_id)
      people.push({
        userId: call.callee_id,
        device: call.state === 'active' ? call.callee_device : null,
      });
    return people;
  }
  const rows = await db
    .selectFrom('call_members')
    .select(['user_id', 'device'])
    .where('call_id', '=', call.id)
    .where('state', '=', 'joined')
    .execute();
  return rows.map((r) => ({ userId: r.user_id, device: r.device }));
}

/** Who reads a call's notes, and from when: whoever was in it, from when they joined (R85 (2)). */
async function readersOf(db: Db, call: Call): Promise<Map<string, Date>> {
  const from = new Map<string, Date>();
  if (!call.is_group) {
    if (call.answered_at) {
      if (call.caller_id) from.set(call.caller_id, call.created_at);
      if (call.callee_id) from.set(call.callee_id, call.answered_at);
    }
    return from;
  }
  const rows = await db
    .selectFrom('call_members')
    .select(['user_id', 'joined_at'])
    .where('call_id', '=', call.id)
    .where('joined_at', 'is not', null)
    .execute();
  // Someone who left and joined again reads from their latest join.
  for (const r of rows) if (r.joined_at) from.set(r.user_id, r.joined_at);
  return from;
}

async function callById(db: Db, callId: string): Promise<Call | undefined> {
  return db.selectFrom('calls').selectAll().where('id', '=', callId).executeTakeFirst();
}

/** The notes being asked for or taken in a call now, if any. */
async function liveNotesOf(db: Db, callId: string) {
  return db
    .selectFrom('call_notes')
    .selectAll()
    .where('call_id', '=', callId)
    .where('state', 'in', ['asking', 'on'])
    .executeTakeFirst();
}

const isId = (x: string | null | undefined): x is string => Boolean(x);

/** People's names as everyone sees them (one face per person, R99). */
async function namesOf(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db
    .selectFrom('users')
    .select(['id', 'display_name'])
    .where('id', 'in', [...new Set(ids)])
    .execute();
  return new Map(rows.map((r) => [r.id, r.display_name]));
}

/**
 * A call's notes as everyone who may see the call sees them: the live ones, else the latest, so
 * the call says why Cai stopped. Never who said no, nor who stopped it.
 */
export async function notesViewOf(db: Db, call: Call): Promise<CallNotesView | null> {
  const notes = await db
    .selectFrom('call_notes')
    .selectAll()
    .where('call_id', '=', call.id)
    .orderBy('asked_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!notes) return null;
  const [answers, asked] = await Promise.all([
    db
      .selectFrom('call_note_answers')
      .select(['user_id', 'answer'])
      .where('notes_id', '=', notes.id)
      .execute(),
    askedIn(db, call),
  ]);
  const said = new Map(answers.map((a) => [a.user_id, a.answer]));
  // Who said yes, and who hasn't answered, only while it's asked or on: once it's over, who
  // didn't say yes would tell who said no.
  const live = notes.state === 'asking' || notes.state === 'on';
  const here = live ? asked.map((p) => p.userId) : [];
  const waiting = notes.state === 'asking' ? here.filter((id) => !said.has(id)) : [];
  const names = await namesOf(db, [notes.started_by, ...waiting].filter(isId));
  return {
    id: notes.id,
    state: notes.state,
    askedBy: {
      id: notes.started_by ?? '',
      displayName: (notes.started_by && names.get(notes.started_by)) || tr('Deleted account'),
    },
    yes: here.filter((id) => said.get(id) === 'yes'),
    waitingOn: waiting.map((id) => ({ id, displayName: names.get(id) ?? '' })),
    recorderDevice: notes.state === 'on' ? notes.recorder_device : null,
    startedAt: notes.started_at?.toISOString() ?? null,
    stoppedAt: notes.stopped_at?.toISOString() ?? null,
    why: notes.why,
  };
}

/**
 * Tell those who may see the call how its notes stand: a 1:1 call's two, a group call's whole
 * conversation (its banner offers to join with Cai or without).
 */
async function publishNotes(ctx: AppContext, call: Call): Promise<void> {
  const notes = await notesViewOf(ctx.db, call);
  if (!notes) return;
  const to = call.is_group
    ? (await participantsOf(ctx.db, call.conversation_id)).map((p) => p.user_id)
    : [call.caller_id, call.callee_id].filter(isId);
  await ctx.bus.publish(to, {
    type: 'call.notes',
    data: { callId: call.id, conversationId: call.conversation_id, group: call.is_group, notes },
  });
}

/**
 * Settle a call's notes from the call as it is, under the notes' row lock, and tell everyone when
 * that changed anything: the one place their state moves. Says whether it told them.
 */
export async function reconcileNotes(ctx: AppContext, callId: string): Promise<boolean> {
  const changed = await ctx.db.transaction().execute(async (trx) => {
    const notes = await trx
      .selectFrom('call_notes')
      .selectAll()
      .where('call_id', '=', callId)
      .where('state', 'in', ['asking', 'on'])
      .forNoKeyUpdate()
      .executeTakeFirst();
    if (!notes) return null;
    const call = await callById(trx, callId);
    if (!call) return null;
    const asked = await askedIn(trx, call);
    const answers = await trx
      .selectFrom('call_note_answers')
      .select(['user_id', 'answer', 'device', 'can_record', 'at'])
      .where('notes_id', '=', notes.id)
      .orderBy('at')
      .execute();
    const said = new Map(answers.map((a) => [a.user_id, a]));
    const end = async (why: CallNotesWhy) => {
      await trx
        .updateTable('call_notes')
        .set({
          state: notes.state === 'asking' ? 'declined' : 'stopped',
          why,
          stopped_at: ctx.now(),
          recorder_id: null,
          recorder_device: null,
        })
        .where('id', '=', notes.id)
        .execute();
      return { call, outcome: why };
    };
    if (call.state === 'ended') return end('ended');
    const ids = asked.map((p) => p.userId);
    if (await anyMinor(trx, ids, ctx.now())) return end('minor');
    if (asked.some((p) => said.get(p.userId)?.answer === 'no'))
      return end(notes.state === 'asking' ? 'declined' : 'joined_without');
    // A group call with one person in it so far: it waits for whoever joins, who choose as they do.
    if (asked.length < 2) return null;
    const allYes = asked.every((p) => said.get(p.userId)?.answer === 'yes');
    if (notes.state === 'on' && !allYes) return end('joined_without');
    if (notes.state === 'asking' && !allYes) return null;
    // Everyone in it said yes. The recorder is a member's browser in the call (never a guest's,
    // R85 (4)) on the device they said yes on: one still recording stays, else the asker's, else
    // whoever said yes first.
    const members = new Set(
      (
        await trx
          .selectFrom('users')
          .select('id')
          .where('id', 'in', ids)
          .where('kind', '=', 'human')
          .execute()
      ).map((u) => u.id),
    );
    const can = (p: Asked) => {
      const a = said.get(p.userId);
      return Boolean(members.has(p.userId) && a?.can_record && p.device && a.device === p.device);
    };
    const keep = asked.find(
      (p) => p.userId === notes.recorder_id && p.device === notes.recorder_device && can(p),
    );
    const next =
      keep ??
      asked.find((p) => p.userId === notes.started_by && can(p)) ??
      asked
        .filter(can)
        .sort(
          (a, b) =>
            (said.get(a.userId)?.at.getTime() ?? 0) - (said.get(b.userId)?.at.getTime() ?? 0),
        )[0];
    if (!next) return end('no_recorder');
    if (notes.state === 'on' && keep) return null;
    await trx
      .updateTable('call_notes')
      .set({
        state: 'on',
        started_at: notes.started_at ?? ctx.now(),
        recorder_id: next.userId,
        recorder_device: next.device,
      })
      .where('id', '=', notes.id)
      .execute();
    return { call, outcome: notes.state === 'asking' ? 'started' : 'handed_over' };
  });
  if (!changed) return false;
  ctx.metrics.callNotes.inc({ outcome: changed.outcome });
  await publishNotes(ctx, changed.call);
  return true;
}

/**
 * After an ask or an answer: settled, and told either way, since one that leaves the notes asked
 * still changes who's waited on (and a new ask must reach whoever is asked).
 */
async function settleAndTell(ctx: AppContext, callId: string): Promise<void> {
  if (await reconcileNotes(ctx, callId)) return;
  const call = await callById(ctx.db, callId);
  if (call) await publishNotes(ctx, call);
}

const notInCall = () => new AppError(403, 'not_in_call', tr('You’re not in that call.'));

/** A call this person was in or rung for, or it doesn't exist for them. */
export async function callForNotes(ctx: AppContext, callId: string, userId: string): Promise<Call> {
  const call = await callById(ctx.db, callId);
  if (!call) throw notFound(tr('That call'));
  const theirs = call.is_group
    ? Boolean(
        await ctx.db
          .selectFrom('call_members')
          .select('user_id')
          .where('call_id', '=', callId)
          .where('user_id', '=', userId)
          .executeTakeFirst(),
      )
    : call.caller_id === userId || call.callee_id === userId;
  if (!theirs) throw notFound(tr('That call'));
  return call;
}

/**
 * Who may ask Cai to take notes (R85): someone in the call on this device, where Cai may take
 * notes (`assertNotesAllowed`: an adult on Caime, not a meeting's guest, with AI assist on, in a
 * call that isn't in a private conversation and has nobody under 18 in it, on a Caime whose
 * speech provider is set up), with room left today.
 */
async function mayAsk(ctx: AppContext, call: Call, userId: string, deviceId: string) {
  if (call.state === 'ended') throw new AppError(409, 'call_ended', tr('That call has ended.'));
  const asked = await askedIn(ctx.db, call);
  if (!asked.some((p) => p.userId === userId && p.device === deviceId)) throw notInCall();
  await assertNotesAllowed(ctx, {
    conversationId: call.conversation_id,
    askerId: userId,
    people: asked.map((p) => p.userId),
    where: 'call',
  });
  ctx.limiter.hit(`call-notes:${userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
  await assertAiAllowance(ctx, userId);
}

export interface NotesChoice {
  deviceId: string;
  /** This device can record (a browser with a recorder): it may be the one that does. */
  canRecord: boolean;
}

async function saveAnswer(
  db: Db,
  notesId: string,
  userId: string,
  answer: 'yes' | 'no',
  choice: NotesChoice,
  at: Date,
): Promise<void> {
  await db
    .insertInto('call_note_answers')
    .values({
      notes_id: notesId,
      user_id: userId,
      answer,
      device: choice.deviceId,
      can_record: choice.canRecord,
      at,
    })
    .onConflict((oc) =>
      oc.columns(['notes_id', 'user_id']).doUpdateSet({
        answer,
        device: choice.deviceId,
        can_record: choice.canRecord,
        at,
      }),
    )
    .execute();
}

/** Ask Cai to take notes: the asker's yes, and everyone else in the call asked. */
export async function askNotes(
  ctx: AppContext,
  call: Call,
  userId: string,
  choice: NotesChoice,
): Promise<void> {
  await mayAsk(ctx, call, userId, choice.deviceId);
  await ctx.db.transaction().execute(async (trx) => {
    const live = await liveNotesOf(trx, call.id);
    if (live) {
      // Asked already (by them, or by someone else at the same moment): this is a yes to it.
      await saveAnswer(trx, live.id, userId, 'yes', choice, ctx.now());
      return;
    }
    const id = uuidv7();
    const made = await trx
      .insertInto('call_notes')
      .values({
        id,
        call_id: call.id,
        conversation_id: call.conversation_id,
        started_by: userId,
        state: 'asking',
        asked_at: ctx.now(),
      })
      // The partial unique index is named by its own predicate, written as it is (no parameters).
      .onConflict((oc) =>
        oc.column('call_id').where(sql<boolean>`state in ('asking', 'on')`).doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    const notesId = made?.id ?? (await liveNotesOf(trx, call.id))?.id;
    if (!notesId) return;
    if (made) ctx.metrics.callNotes.inc({ outcome: 'asked' });
    await saveAnswer(trx, notesId, userId, 'yes', choice, ctx.now());
  });
  await settleAndTell(ctx, call.id);
}

/** Someone in the call answers the ask, on the device they're in it on. */
export async function answerNotes(
  ctx: AppContext,
  call: Call,
  userId: string,
  answer: 'yes' | 'no',
  choice: NotesChoice,
): Promise<void> {
  const asked = await askedIn(ctx.db, call);
  if (!asked.some((p) => p.userId === userId && p.device === choice.deviceId)) throw notInCall();
  const live = await liveNotesOf(ctx.db, call.id);
  if (!live) return;
  await saveAnswer(ctx.db, live.id, userId, answer, choice, ctx.now());
  await settleAndTell(ctx, call.id);
}

/**
 * The choice a ring answered or a call joined carries (R85 (1)), saved in the transaction that
 * puts them in the call, so the call is never settled with them in it and their answer missing.
 */
export async function answerOnEntry(
  trx: Transaction<Database>,
  callId: string,
  userId: string,
  answer: 'yes' | 'no' | undefined,
  choice: NotesChoice,
  at: Date,
): Promise<void> {
  if (!answer) return;
  const live = await liveNotesOf(trx, callId);
  if (live) await saveAnswer(trx, live.id, userId, answer, choice, at);
}

/** Stop Cai, for everyone, from now (R85 (2)): anyone in the call, any time. */
export async function stopNotes(ctx: AppContext, call: Call, userId: string): Promise<void> {
  const asked = await askedIn(ctx.db, call);
  if (!asked.some((p) => p.userId === userId)) throw notInCall();
  const stopped = await ctx.db
    .updateTable('call_notes')
    .set((eb) => ({
      state: eb
        .case()
        .when('state', '=', 'asking')
        .then('declined' as const)
        .else('stopped' as const)
        .end(),
      why: 'stopped' as const,
      stopped_at: ctx.now(),
      stopped_by: userId,
      recorder_id: null,
      recorder_device: null,
    }))
    .where('call_id', '=', call.id)
    .where('state', 'in', ['asking', 'on'])
    .returning('id')
    .executeTakeFirst();
  if (!stopped) return;
  ctx.metrics.callNotes.inc({ outcome: 'stopped' });
  await publishNotes(ctx, call);
}

/**
 * A call has ended: its notes stop. Says whether any were taken, for its line, which `withLine`
 * then ties them to (erased with it, gone when it disappears).
 */
export async function notesAtEnd(ctx: AppContext, callId: string): Promise<{ taken: boolean }> {
  await reconcileNotes(ctx, callId);
  const taken = await ctx.db
    .selectFrom('call_notes')
    .select('id')
    .where('call_id', '=', callId)
    .where('started_at', 'is not', null)
    .executeTakeFirst();
  return { taken: Boolean(taken) };
}

/** The call's line, written: its notes go with it from now. */
export async function notesWithLine(
  ctx: AppContext,
  callId: string,
  messageId: string,
): Promise<void> {
  await ctx.db
    .updateTable('call_notes')
    .set({ message_id: messageId })
    .where('call_id', '=', callId)
    .execute();
}

/** One utterance from the device recording, kept until it's heard. Its id, or null if dropped. */
export async function saveLine(
  ctx: AppContext,
  call: Call,
  userId: string,
  line: { deviceId: string; speakerId: string; at: Date; bytes: Buffer; mime: string },
): Promise<string | null> {
  const notes = await liveNotesOf(ctx.db, call.id);
  if (
    notes?.state !== 'on' ||
    notes.recorder_id !== userId ||
    notes.recorder_device !== line.deviceId
  )
    throw forbidden(tr('This device isn’t taking notes in that call.'));
  const yes = await ctx.db
    .selectFrom('call_note_answers')
    .select('user_id')
    .where('notes_id', '=', notes.id)
    .where('user_id', '=', line.speakerId)
    .where('answer', '=', 'yes')
    .executeTakeFirst();
  // Only the voices of people who said yes are kept; any other is dropped, and said nowhere.
  if (!yes) return null;
  // Its length is read from the recording, never the one the device said (M16 G12).
  const heardMs = audioLengthMs(line.bytes, line.mime);
  if (heardMs === null || heardMs > LINE_MAX_MS + LINE_SLACK_MS)
    throw new AppError(413, 'too_large', tr('That recording is too long to transcribe.'));
  if (heardMs < LINE_MIN_MS) return null;
  const now = ctx.now().getTime();
  const from = (notes.started_at?.getTime() ?? now) - LINE_SLACK_MS;
  const at = new Date(Math.min(now, Math.max(from, line.at.getTime())));
  const file = await storeBytes(ctx, storageFor(ctx.config), {
    ownerId: userId,
    bytes: line.bytes,
    mime: line.mime,
    name: 'utterance',
  });
  const id = uuidv7();
  await ctx.db
    .insertInto('call_note_lines')
    .values({
      id,
      notes_id: notes.id,
      speaker_id: line.speakerId,
      spoken_at: at,
      length_ms: heardMs,
      file_id: file.id,
      state: 'waiting',
      created_at: ctx.now(),
    })
    .execute();
  await enqueue(ctx, NOTE_JOB, { lineId: id }, { dedupeKey: `${NOTE_JOB}:${id}`, maxAttempts: 3 });
  return id;
}

/** The language hints for a speaker: their interface language, when it's one Caime knows. */
function hintsFor(language: string | null | undefined, locale: string | null | undefined) {
  const chosen = language && language !== 'auto' ? language : (locale ?? '').slice(0, 2);
  return chosen === 'ar' || chosen === 'en' || chosen === 'fr' || chosen === 'tr' ? [chosen] : [];
}

/** A line's audio goes once its words are made or it can't be heard (R85 (5)): never kept. */
async function settleLine(
  ctx: AppContext,
  lineId: string,
  set: { state: 'heard' | 'unheard'; body?: string; language?: string | null },
): Promise<void> {
  const gone = await ctx.db.transaction().execute(async (trx) => {
    const was = await trx
      .selectFrom('call_note_lines')
      .select('file_id')
      .where('id', '=', lineId)
      .forUpdate()
      .executeTakeFirst();
    if (!was) return [];
    await trx
      .updateTable('call_note_lines')
      .set({ ...set, file_id: null })
      .where('id', '=', lineId)
      .execute();
    return was.file_id ? dropUnusedFiles(trx, [was.file_id]) : [];
  });
  await removeStored(ctx, storageFor(ctx.config), gone, 'call notes');
  ctx.metrics.callNotes.inc({ outcome: set.state });
}

async function hear(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const lineId = String(payload.lineId ?? '');
  if (!lineId) return;
  const line = await ctx.db
    .selectFrom('call_note_lines as l')
    .innerJoin('call_notes as n', 'n.id', 'l.notes_id')
    .select(['l.id', 'l.file_id', 'l.state', 'l.speaker_id', 'n.started_by', 'n.call_id'])
    .where('l.id', '=', lineId)
    .executeTakeFirst();
  if (line?.state !== 'waiting') return;
  const speech = ctx.speech;
  const file = line.file_id
    ? await ctx.db
        .selectFrom('files')
        .select(['storage_key', 'size', 'mime', 'name'])
        .where('id', '=', line.file_id)
        .executeTakeFirst()
    : undefined;
  if (!speech || !file || !line.started_by) {
    await settleLine(ctx, lineId, { state: 'unheard' });
    return;
  }
  try {
    await assertAiAllowance(ctx, line.started_by);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    // The asker's day is spent (R107): this line isn't heard, and Cai stops for everyone.
    await settleLine(ctx, lineId, { state: 'unheard' });
    await stopForAllowance(ctx, line.call_id);
    return;
  }
  const bytes = await readAll(ctx, file.storage_key, Number(file.size));
  const audioMs = audioLengthMs(bytes, file.mime);
  if (audioMs === null) {
    await settleLine(ctx, lineId, { state: 'unheard' });
    return;
  }
  const speaker = await ctx.db
    .selectFrom('users')
    .select(['locale', 'preferences'])
    .where('id', '=', line.speaker_id)
    .executeTakeFirst();
  const prefs = (speaker?.preferences ?? {}) as { language?: string };
  try {
    const heard = await runAi(
      ctx,
      'notes',
      line.started_by,
      // Kept with its length, which is what the provider charges for (M16 H7).
      () =>
        speech
          .transcribe({
            bytes,
            mime: file.mime,
            name: file.name,
            languageHints: hintsFor(prefs.language, speaker?.locale),
          })
          .then(
            (r) => ({ ...r, usage: { ...r.usage, audioMs } }),
            (err: unknown) => {
              throw err instanceof AiError && err.usage
                ? new AiError(err.reason, err.message, { ...err.usage, audioMs })
                : err;
            },
          ),
      speech.provider,
    );
    const text = heard.text.trim();
    await settleLine(
      ctx,
      lineId,
      text ? { state: 'heard', body: text, language: heard.language } : { state: 'unheard' },
    );
  } catch (err) {
    // Busy: the job tries again. Anything else: the line isn't heard, and its audio goes.
    if (err instanceof AppError && err.code === 'ai_busy') throw err;
    await settleLine(ctx, lineId, { state: 'unheard' });
  }
  const call = await callById(ctx.db, line.call_id);
  if (call) await tellReaders(ctx, call);
}

async function stopForAllowance(ctx: AppContext, callId: string): Promise<void> {
  const stopped = await ctx.db
    .updateTable('call_notes')
    .set({
      state: 'stopped',
      why: 'allowance',
      stopped_at: ctx.now(),
      recorder_id: null,
      recorder_device: null,
    })
    .where('call_id', '=', callId)
    .where('state', '=', 'on')
    .returning('id')
    .executeTakeFirst();
  if (!stopped) return;
  ctx.metrics.callNotes.inc({ outcome: 'allowance' });
  const call = await callById(ctx.db, callId);
  if (call) await publishNotes(ctx, call);
}

/** Whoever reads the notes hears that they changed: words heard, a line deleted. */
async function tellReaders(ctx: AppContext, call: Call): Promise<void> {
  const readers = [...(await readersOf(ctx.db, call)).keys()];
  if (readers.length)
    await ctx.bus.publish(readers, { type: 'callnotes.changed', data: { callId: call.id } });
}

/** A call's notes for someone who was in it, from when they joined (R85 (2)). */
export async function notesFor(
  ctx: AppContext,
  call: Call,
  viewerId: string,
): Promise<CallNotesResponse> {
  const from = (await readersOf(ctx.db, call)).get(viewerId);
  if (!from) throw notFound(tr('That call'));
  const lines = await ctx.db
    .selectFrom('call_note_lines as l')
    .innerJoin('call_notes as n', 'n.id', 'l.notes_id')
    .select(['l.id', 'l.speaker_id', 'l.spoken_at', 'l.body', 'l.language', 'l.state'])
    .where('n.call_id', '=', call.id)
    .where('l.state', '<>', 'unheard')
    .where((eb) => eb.or([eb('l.spoken_at', '>=', from), eb('l.speaker_id', '=', viewerId)]))
    .orderBy('l.spoken_at')
    .orderBy('l.id')
    .execute();
  const speakers = [...new Set(lines.map((l) => l.speaker_id))];
  const [shown, names] = await Promise.all([
    personViewsFor(
      ctx,
      viewerId,
      speakers.filter((id) => id !== viewerId),
    ),
    namesOf(ctx.db, speakers),
  ]);
  const view: CallNoteLineView[] = lines.map((l) => ({
    id: l.id,
    speaker: {
      id: l.speaker_id,
      displayName:
        shown.get(l.speaker_id)?.displayName ?? names.get(l.speaker_id) ?? tr('Deleted account'),
      avatarUrl: shown.get(l.speaker_id)?.avatarUrl ?? null,
    },
    at: l.spoken_at.toISOString(),
    text: l.state === 'heard' ? l.body : null,
    language: l.language,
    mine: l.speaker_id === viewerId,
  }));
  return {
    callId: call.id,
    conversationId: call.conversation_id,
    notes: await notesViewOf(ctx.db, call),
    lines: view,
  };
}

/** Someone's own words out of a call's notes (R85 (2)): the others keep theirs. */
export async function deleteOwnLine(
  ctx: AppContext,
  call: Call,
  lineId: string,
  userId: string,
): Promise<void> {
  const gone = await ctx.db.transaction().execute(async (trx) => {
    const line = await trx
      .deleteFrom('call_note_lines')
      .where('id', '=', lineId)
      .where('speaker_id', '=', userId)
      .where('notes_id', 'in', (eb) =>
        eb.selectFrom('call_notes').select('id').where('call_id', '=', call.id),
      )
      .returning('file_id')
      .executeTakeFirst();
    if (!line) throw notFound(tr('That line'));
    return line.file_id ? dropUnusedFiles(trx, [line.file_id]) : [];
  });
  await removeStored(ctx, storageFor(ctx.config), gone, 'call notes');
  await tellReaders(ctx, call);
}

async function readAll(ctx: AppContext, key: string, size: number): Promise<Buffer> {
  const storage = storageFor(ctx.config);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of storage.read(key)) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += b.length;
    if (total > Math.min(size, LINE_MAX_BYTES))
      throw new AppError(413, 'too_large', tr('That recording is too long to transcribe.'));
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export function registerNotesJob(): void {
  registerJob(NOTE_JOB, hear);
}
