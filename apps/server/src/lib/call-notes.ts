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
 * Another mode asked while one is on (R114, M17 I13b2) is a row of its own beside the live one
 * (`switching`), asked of everyone again and settled right after it (`settleSwitch`): the mode
 * under way goes on until they have all said yes, then stops as 'replaced' and the switch is it.
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
import { finishOpenParts } from './recording-finish';
import { forgetLater } from './speech-forget';
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
export async function readersOf(db: Db, call: Call): Promise<Map<string, Date>> {
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

export async function callById(db: Db, callId: string): Promise<Call | undefined> {
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

/** Another mode asked while one is on (M17 I13b2), if any: a row beside the live one. */
async function switchingOf(db: Db, callId: string) {
  return db
    .selectFrom('call_notes')
    .selectAll()
    .where('call_id', '=', callId)
    .where('state', '=', 'switching')
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
  // The live row leads; over, the latest. A switch asked beside the live one (M17 I13b2) rides
  // on `switching`, never as the notes themselves (`switch` stays on a declined one), and one
  // that took over is the notes from then on.
  const notes = await db
    .selectFrom('call_notes')
    .selectAll()
    .where('call_id', '=', call.id)
    .where('switch', '=', false)
    .orderBy(sql`case when state in ('asking', 'on') then 0 else 1 end`)
    .orderBy('asked_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!notes) return null;
  const switching = notes.state === 'on' ? await switchingOf(db, call.id) : undefined;
  const [answers, asked] = await Promise.all([
    db
      .selectFrom('call_note_answers')
      .select(['notes_id', 'user_id', 'answer'])
      .where('notes_id', 'in', [notes.id, switching?.id].filter(isId))
      .execute(),
    askedIn(db, call),
  ]);
  const saidTo = (id: string) =>
    new Map(answers.filter((a) => a.notes_id === id).map((a) => [a.user_id, a.answer]));
  const said = saidTo(notes.id);
  // Who said yes, and who hasn't answered, only while it's asked or on: once it's over, who
  // didn't say yes would tell who said no.
  const live = notes.state === 'asking' || notes.state === 'on';
  const here = live ? asked.map((p) => p.userId) : [];
  const waiting = notes.state === 'asking' ? here.filter((id) => !said.has(id)) : [];
  const saidSwitch = switching ? saidTo(switching.id) : new Map<string, string>();
  const waitingSwitch = switching ? here.filter((id) => !saidSwitch.has(id)) : [];
  const names = await namesOf(
    db,
    [notes.started_by, ...waiting, switching?.started_by, ...waitingSwitch].filter(isId),
  );
  const person = (id: string | null) => ({
    id: id ?? '',
    displayName: (id && names.get(id)) || tr('Deleted account'),
  });
  return {
    id: notes.id,
    // Never a switching row: the query leaves those to `switching`.
    state: notes.state as CallNotesView['state'],
    askedBy: person(notes.started_by),
    yes: here.filter((id) => said.get(id) === 'yes'),
    waitingOn: waiting.map((id) => ({ id, displayName: names.get(id) ?? '' })),
    recorderDevice: notes.state === 'on' ? notes.recorder_device : null,
    records: notes.records,
    interacts: notes.interacts,
    startedAt: notes.started_at?.toISOString() ?? null,
    stoppedAt: notes.stopped_at?.toISOString() ?? null,
    why: notes.why,
    switching: switching
      ? {
          id: switching.id,
          records: switching.records,
          interacts: switching.interacts,
          askedBy: person(switching.started_by),
          yes: here.filter((id) => saidSwitch.get(id) === 'yes'),
          waitingOn: waitingSwitch.map((id) => ({ id, displayName: names.get(id) ?? '' })),
        }
      : null,
  };
}

/** Who may see a call: a 1:1 call's two, a group call's whole conversation. */
export async function callAudience(ctx: AppContext, call: Call): Promise<string[]> {
  return call.is_group
    ? (await participantsOf(ctx.db, call.conversation_id)).map((p) => p.user_id)
    : [call.caller_id, call.callee_id].filter(isId);
}

/** The first names of everyone in the call now, for Cai to tell its own name from theirs (I13g). */
export async function callPeopleNames(db: Db, call: Call): Promise<string[]> {
  const asked = await askedIn(db, call);
  const names = await namesOf(
    db,
    asked.map((p) => p.userId),
  );
  return [...names.values()];
}

/**
 * What Cai joining in a call does (M17 I13g, `lib/cai-interact.ts`), registered at start so the
 * notes never import it: a line heard, and the notes begun in that mode.
 */
export interface InteractHooks {
  lineHeard(ctx: AppContext, lineId: string): Promise<void>;
  started(ctx: AppContext, callId: string): Promise<void>;
}
let interact: InteractHooks | null = null;
export function registerInteractHooks(hooks: InteractHooks): void {
  interact = hooks;
}

/**
 * Tell those who may see the call how its notes stand: a 1:1 call's two, a group call's whole
 * conversation (its banner offers to join with Cai or without).
 */
async function publishNotes(ctx: AppContext, call: Call): Promise<void> {
  const notes = await notesViewOf(ctx.db, call);
  if (!notes) return;
  const to = await callAudience(ctx, call);
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
    // Everyone in it said yes.
    const { keep, next } = await recorderFor(trx, asked, said, notes);
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
  const switched = await settleSwitch(ctx, callId);
  if (!changed && !switched) return false;
  if (changed) ctx.metrics.callNotes.inc({ outcome: changed.outcome });
  if (switched) ctx.metrics.callNotes.inc({ outcome: switched.outcome });
  await publishNotes(ctx, (changed ?? switched)?.call as Call);
  // Stopped, recorded on another device now, or taken over by another mode (M17 I13b2): what
  // the old recorder was sending is finished.
  if ((changed && changed.outcome !== 'started') || switched?.outcome === 'switched')
    await finishOpenParts(ctx, callId);
  // Begun with Cai joining in (M17 I13g): it introduces itself once.
  if (changed?.outcome === 'started' || switched?.outcome === 'switched')
    await interact?.started(ctx, callId).catch((err) => {
      ctx.log.warn({ err, callId }, 'cai introduction not queued');
    });
  return true;
}

type Answered = { user_id: string; device: string | null; can_record: boolean; at: Date };

/**
 * Who records, once everyone in it said yes: a member's browser in the call (never a guest's,
 * R85 (4)) on the device they said yes on: one still recording stays (`keep`), else the asker's,
 * else whoever said yes first.
 */
async function recorderFor(
  trx: Transaction<Database>,
  asked: Asked[],
  said: Map<string, Answered>,
  notes: { recorder_id: string | null; recorder_device: string | null; started_by: string | null },
): Promise<{ keep: Asked | undefined; next: Asked | undefined }> {
  const ids = asked.map((p) => p.userId);
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
        (a, b) => (said.get(a.userId)?.at.getTime() ?? 0) - (said.get(b.userId)?.at.getTime() ?? 0),
      )[0];
  return { keep, next };
}

/**
 * Another mode asked while one is on (R114, M17 I13b2), settled after the live row under its
 * own lock: declined by anyone's no, by the mode under way ending (with its reason), or when
 * nobody who said yes can record; once everyone in the call has said yes to it, the mode under
 * way stops ('replaced') and the switch takes over, its recorder chosen as a start's is (the
 * one recording stays where it can). Nothing moves while anyone is still asked.
 */
async function settleSwitch(
  ctx: AppContext,
  callId: string,
): Promise<{ call: Call; outcome: 'switched' | 'switch_declined' } | null> {
  return ctx.db.transaction().execute(async (trx) => {
    const sw = await trx
      .selectFrom('call_notes')
      .selectAll()
      .where('call_id', '=', callId)
      .where('state', '=', 'switching')
      .forNoKeyUpdate()
      .executeTakeFirst();
    if (!sw) return null;
    const call = await callById(trx, callId);
    if (!call) return null;
    const live = await trx
      .selectFrom('call_notes')
      .selectAll()
      .where('call_id', '=', callId)
      .where('state', '=', 'on')
      .forNoKeyUpdate()
      .executeTakeFirst();
    const decline = async (why: CallNotesWhy) => {
      await trx
        .updateTable('call_notes')
        .set({ state: 'declined', why, stopped_at: ctx.now() })
        .where('id', '=', sw.id)
        .execute();
      return { call, outcome: 'switch_declined' as const };
    };
    if (!live) {
      // With the notes it was asked beside: for their reason.
      const ended = await trx
        .selectFrom('call_notes')
        .select('why')
        .where('call_id', '=', callId)
        .where('state', 'in', ['stopped', 'declined'])
        .where('switch', '=', false)
        .orderBy('stopped_at', 'desc')
        .limit(1)
        .executeTakeFirst();
      return decline(ended?.why ?? (call.state === 'ended' ? 'ended' : 'stopped'));
    }
    if (call.state === 'ended') return decline('ended');
    const asked = await askedIn(trx, call);
    const answers = await trx
      .selectFrom('call_note_answers')
      .select(['user_id', 'answer', 'device', 'can_record', 'at'])
      .where('notes_id', '=', sw.id)
      .orderBy('at')
      .execute();
    const said = new Map(answers.map((a) => [a.user_id, a]));
    if (asked.some((p) => said.get(p.userId)?.answer === 'no')) return decline('declined');
    if (asked.length < 2 || !asked.every((p) => said.get(p.userId)?.answer === 'yes')) return null;
    const { next } = await recorderFor(trx, asked, said, {
      recorder_id: live.recorder_id,
      recorder_device: live.recorder_device,
      started_by: sw.started_by,
    });
    if (!next) return decline('no_recorder');
    // The row it replaces stops first: one live row a call (the index), then the switch is it.
    await trx
      .updateTable('call_notes')
      .set({
        state: 'stopped',
        why: 'replaced',
        stopped_at: ctx.now(),
        recorder_id: null,
        recorder_device: null,
      })
      .where('id', '=', live.id)
      .execute();
    await trx
      .updateTable('call_notes')
      .set({
        state: 'on',
        switch: false,
        started_at: ctx.now(),
        recorder_id: next.userId,
        recorder_device: next.device,
      })
      .where('id', '=', sw.id)
      .execute();
    return { call, outcome: 'switched' as const };
  });
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
  /**
   * The ask this choice was shown (M17 I13b): a yes counts only for it, so a yes to notes alone
   * never becomes consent to a recording asked a moment later (R114 (1)).
   */
  notesId?: string;
}

/** A yes given to another ask than the live one is no answer to it: they're asked again. */
const staleYes = (live: { id: string }, answer: 'yes' | 'no', choice: NotesChoice) =>
  answer === 'yes' && Boolean(choice.notesId) && choice.notesId !== live.id;

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

/** The mode asked for (R114): notes alone, with a recording, with Cai joining in, or both. */
export interface NotesMode {
  records?: boolean;
  interacts?: boolean;
}

const sameMode = (row: { records: boolean; interacts: boolean }, mode: NotesMode) =>
  row.records === Boolean(mode.records) && row.interacts === Boolean(mode.interacts);

/**
 * Ask Cai to take notes, and to record the call too when `records` (R114 (1)), or to join in
 * when `interacts` (R114 (3), M17 I13g): the asker's yes, and everyone else in the call asked.
 */
export async function askNotes(
  ctx: AppContext,
  call: Call,
  userId: string,
  choice: NotesChoice,
  mode: NotesMode = {},
): Promise<void> {
  await mayAsk(ctx, call, userId, choice.deviceId);
  const records = Boolean(mode.records);
  const interacts = Boolean(mode.interacts);
  // Cai joins in only with a voice to speak with, and from a browser that can play it into the
  // call (the recorder's): a phone asks in writing (I13f).
  if (interacts && !ctx.tts)
    throw new AppError(503, 'ai_unavailable', tr('Cai can’t join in on this Caime yet.'));
  await ctx.db.transaction().execute(async (trx) => {
    const live = await liveNotesOf(trx, call.id);
    if (live) {
      if (sameMode(live, mode)) {
        // Asked already (by them, or by someone else at the same moment): this is a yes to it.
        await saveAnswer(trx, live.id, userId, 'yes', choice, ctx.now());
        return;
      }
      // Another mode while one is still asked is answered first; while one is on, it's asked
      // of everyone again beside it, the mode under way going on until they have (M17 I13b2).
      if (live.state !== 'on')
        throw new AppError(
          409,
          'conflict',
          live.interacts
            ? tr('Cai is already being asked to join this call.')
            : live.records
              ? tr('Cai is already being asked to record this call.')
              : tr('Cai is already being asked to take notes in this call.'),
        );
      const asked = await switchingOf(trx, call.id);
      if (asked) {
        // The same switch asked by someone else: a yes to it. The other way round is the mode
        // already on.
        if (sameMode(asked, mode))
          await saveAnswer(trx, asked.id, userId, 'yes', choice, ctx.now());
        return;
      }
      const made = await trx
        .insertInto('call_notes')
        .values({
          id: uuidv7(),
          call_id: call.id,
          conversation_id: call.conversation_id,
          started_by: userId,
          state: 'switching',
          switch: true,
          records,
          interacts,
          asked_at: ctx.now(),
        })
        .onConflict((oc) =>
          oc.column('call_id').where(sql<boolean>`state = 'switching'`).doNothing(),
        )
        .returning('id')
        .executeTakeFirst();
      const switchId = made?.id ?? (await switchingOf(trx, call.id))?.id;
      if (!switchId) return;
      if (made) ctx.metrics.callNotes.inc({ outcome: 'switch_asked' });
      await saveAnswer(trx, switchId, userId, 'yes', choice, ctx.now());
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
        records,
        interacts,
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
  // An answer to the switch asked beside the live notes (M17 I13b2) names it; else it's the
  // live notes' (and a yes to another ask than theirs is no answer).
  const live = await liveNotesOf(ctx.db, call.id);
  const switching = await switchingOf(ctx.db, call.id);
  const target = switching && choice.notesId === switching.id ? switching : live;
  if (!target) return;
  if (!staleYes(target, answer, choice))
    await saveAnswer(ctx.db, target.id, userId, answer, choice, ctx.now());
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
  if (live && !staleYes(live, answer, choice))
    await saveAnswer(trx, live.id, userId, answer, choice, at);
}

/** Stop Cai, for everyone, from now (R85 (2)): anyone in the call, any time. */
export async function stopNotes(
  ctx: AppContext,
  call: Call,
  userId: string,
  opts: { all?: boolean } = {},
): Promise<void> {
  const asked = await askedIn(ctx.db, call);
  if (!asked.some((p) => p.userId === userId)) throw notInCall();
  // A switch asked beside the live notes (M17 I13b2) is withdrawn on its own: the mode under
  // way goes on. `all` (the recording deleted while it's being made) stops everything.
  if (!opts.all) {
    const switching = await switchingOf(ctx.db, call.id);
    if (switching) {
      await ctx.db
        .updateTable('call_notes')
        .set({ state: 'declined', why: 'stopped', stopped_at: ctx.now(), stopped_by: userId })
        .where('id', '=', switching.id)
        .execute();
      ctx.metrics.callNotes.inc({ outcome: 'switch_declined' });
      await publishNotes(ctx, call);
      return;
    }
  }
  const stopped = await ctx.db
    .updateTable('call_notes')
    .set((eb) => ({
      state: eb
        .case()
        .when('state', '=', 'asking')
        .then('declined' as const)
        .when('state', '=', 'switching')
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
    .where('state', 'in', ['asking', 'on', 'switching'])
    .returning('id')
    .execute();
  if (!stopped.length) return;
  ctx.metrics.callNotes.inc({ outcome: 'stopped' });
  await publishNotes(ctx, call);
  await finishOpenParts(ctx, call.id);
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
    .select([
      'l.id',
      'l.file_id',
      'l.state',
      'l.speaker_id',
      'n.started_by',
      'n.call_id',
      'n.state as notesState',
      'n.interacts',
    ])
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
            // Read as notes (M17 F8a): the voice isn't kept, so the words are all there is.
            clean: true,
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
    await forgetLater(ctx, heard.ref);
    // With Cai joining in (M17 I13g), what was heard may be an echo of its voice or a call to it.
    if (text && line.interacts && line.notesState === 'on')
      await interact?.lineHeard(ctx, lineId).catch((err) => {
        ctx.log.warn({ err, lineId }, 'cai answer not queued');
      });
  } catch (err) {
    // Busy: the job tries again. Anything else: the line isn't heard, and its audio goes.
    if (err instanceof AppError && err.code === 'ai_busy') throw err;
    await settleLine(ctx, lineId, { state: 'unheard' });
  }
  const call = await callById(ctx.db, line.call_id);
  if (call) await tellReaders(ctx, call);
}

async function stopForAllowance(ctx: AppContext, callId: string): Promise<void> {
  // A switch asked beside them (M17 I13b2) goes with them: it was for the same allowance.
  const stopped = await ctx.db
    .updateTable('call_notes')
    .set((eb) => ({
      state: eb
        .case()
        .when('state', '=', 'switching')
        .then('declined' as const)
        .else('stopped' as const)
        .end(),
      why: 'allowance' as const,
      stopped_at: ctx.now(),
      recorder_id: null,
      recorder_device: null,
    }))
    .where('call_id', '=', callId)
    .where('state', 'in', ['on', 'switching'])
    .returning('id')
    .execute();
  if (!stopped.length) return;
  ctx.metrics.callNotes.inc({ outcome: 'allowance' });
  const call = await callById(ctx.db, callId);
  if (call) await publishNotes(ctx, call);
  await finishOpenParts(ctx, callId);
}

/** Whoever reads the notes hears that they changed: words heard, a line deleted. */
export async function tellReaders(ctx: AppContext, call: Call): Promise<void> {
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
    summary: null,
    summaryState: null,
    recording: null,
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
