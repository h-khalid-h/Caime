/**
 * Cai records a call (R114 (4), M17 I13b): the Record mode of a call's notes. The member's browser
 * that records the notes (R85 (4)) also records the voices of everyone in the call, mixed, as one
 * part, and each screen shown as a part of its own; a new voices part begins at each join, so
 * someone who joins later plays only what came after (R85 (2)). Each part is sent in pieces of
 * about ten seconds while it's recorded (`appendPiece`, at an offset under the part's row lock, as
 * a resumable upload is), so a recorder that drops loses at most the piece under way; once it ends
 * it's made seekable by copying it into an MP4 without re-encoding (`remux`, in the
 * `call.recording.finish` job), and played by whoever was in the call when it began.
 *
 * Nothing is taken after a no: a piece lands only while the notes are on, or within a minute of
 * the call ending or its recorder leaving (the piece that was on its way then). A recording goes
 * thirty days on, or sooner where an organization keeps less (R54); anyone who was in it deletes
 * it for everyone (R52); erasing the call's line takes it too (`eraseMessagesWhere`). Its bytes
 * are the server's, never counted against anyone's storage while it's kept for the thirty days;
 * whoever asked for it may keep it past its day (M17 I13d, `keepRecording`), and then its bytes
 * count against their storage until they let it go, never past an organization's retention.
 * Anyone who was in it shares it into a conversation of theirs (R114 (7), M17 I13e,
 * `lib/recording-shares.ts`): a share is read through its message (`via`) and goes when the
 * recording does (`dropSharesOf`, and the sweep for one gone any other way).
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  type CallPersonView,
  type CallRecordingPartView,
  type CallRecordingView,
  RECORDING_DAYS,
  tr,
  uuidv7,
} from '@caime/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Call, CallRecordingPartsTable, Database } from '../db/schema';
import { readersOf, stopNotes } from './call-notes';
import { AppError, badRequest, forbidden, notFound } from './errors';
import { enqueue, registerJob, registerPeriodic } from './jobs';
import { retentionFor } from './messages';
import { removeForEveryone } from './moderation';
import { personViewsFor } from './people-batch';
import { assertStorage, lockStorage } from './plans';
import { finishOpenParts, LATE_MS, RECORDING_FINISH_JOB } from './recording-finish';
import { storageFor } from './storage';

type Db = Kysely<Database> | Transaction<Database>;
type PartKind = CallRecordingPartsTable['kind'];

/** A piece is about ten seconds; a screen at its most is under two megabytes of it. */
export const PIECE_MAX_BYTES = 8 * 1024 * 1024;
/** A part past this is ended, and the recorder begins another. */
export const PART_MAX_BYTES = 1024 * 1024 * 1024;
/** A call's parts at most: a new voices part at each join, a screen part at each share. */
export const PARTS_MAX = 200;
/** A part's start is the recorder's clock, held to within this of the server's. */
const CLOCK_SLACK_MS = 10_000;
/** A part with no piece for this long, its recorder gone, is finished by the daily sweep. */
const STALE_MS = 60 * 60_000;
/** What the daily sweep takes at a time. */
const SWEEP_BATCH = 200;
/** Why the notes stopped when a piece already on its way may still land: nobody said no. */
const LATE_OK = new Set(['ended', 'no_recorder', 'allowance', 'replaced']);

const notRecording = () => forbidden(tr('This device isn’t recording that call.'));

/** The day a recording that begins now is deleted: thirty days, or an organization's fewer. */
async function untilFor(db: Db, conversationId: string, now: Date): Promise<Date> {
  const days = (await retentionFor(db, conversationId, RECORDING_DAYS)) ?? RECORDING_DAYS;
  return new Date(now.getTime() + Math.min(days, RECORDING_DAYS) * 86_400_000);
}

/**
 * A part begun on the device recording: everyone's voices from now, or someone's shared screen.
 * Only while Cai records the call and this device is its recorder; a screen is someone's in it.
 */
export async function startPart(
  ctx: AppContext,
  call: Call,
  userId: string,
  body: { deviceId: string; kind: PartKind; shownBy?: string; mime: string; at: number },
): Promise<string> {
  const isVideo = body.mime.startsWith('video/');
  if ((body.kind === 'screen') !== Boolean(body.shownBy) || (body.kind === 'screen' && !isVideo))
    throw badRequest(tr('That isn’t a recording Caime reads.'));
  const now = ctx.now();
  return ctx.db.transaction().execute(async (trx) => {
    const notes = await trx
      .selectFrom('call_notes')
      .select(['id', 'records', 'recorder_id', 'recorder_device', 'recording_until'])
      .where('call_id', '=', call.id)
      .where('state', '=', 'on')
      .forNoKeyUpdate()
      .executeTakeFirst();
    if (!notes?.records || notes.recorder_id !== userId || notes.recorder_device !== body.deviceId)
      throw notRecording();
    // Only the screen of someone who said yes to this recording.
    if (body.shownBy) {
      const yes = await trx
        .selectFrom('call_note_answers')
        .select('user_id')
        .where('notes_id', '=', notes.id)
        .where('user_id', '=', body.shownBy)
        .where('answer', '=', 'yes')
        .executeTakeFirst();
      if (!yes) throw notRecording();
    }
    const { count } = await trx
      .selectFrom('call_recording_parts')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('notes_id', '=', notes.id)
      .executeTakeFirstOrThrow();
    if (Number(count) >= PARTS_MAX)
      throw new AppError(409, 'limit', tr('This call’s recording can’t hold any more parts.'));
    const id = uuidv7();
    const at = Math.min(now.getTime(), Math.max(now.getTime() - CLOCK_SLACK_MS, body.at));
    await trx
      .insertInto('call_recording_parts')
      .values({
        id,
        notes_id: notes.id,
        call_id: call.id,
        kind: body.kind,
        shown_by: body.shownBy ?? null,
        recorder_id: userId,
        recorder_device: body.deviceId,
        storage_key: `tmp/recording-${id}`,
        mime: body.mime,
        started_at: new Date(at),
        created_at: now,
      })
      .execute();
    if (!notes.recording_until)
      await trx
        .updateTable('call_notes')
        .set({ recording_until: await untilFor(trx, call.conversation_id, now) })
        .where('id', '=', notes.id)
        .execute();
    ctx.metrics.callRecordings.inc({ outcome: 'part_started' });
    return id;
  });
}

/**
 * Whether a piece may still land (a frame of a shown screen too, M17 I13h): while the notes are
 * on, or, the call over or its recorder gone, within a minute (the piece that was on its way).
 * Never after someone's no.
 */
export function mayStillTake(
  notes: { state: string; why: string | null; stopped_at: Date | null },
  now: Date,
): boolean {
  if (notes.state === 'on') return true;
  return Boolean(
    notes.state === 'stopped' &&
      notes.why &&
      LATE_OK.has(notes.why) &&
      notes.stopped_at &&
      now.getTime() - notes.stopped_at.getTime() <= LATE_MS,
  );
}

/**
 * A piece of a part, appended at the offset the device says it has sent up to, under the part's
 * row lock, so a retry racing its original never interleaves (as a resumable upload's chunk is).
 * The piece is first spooled to its own file by the route, so no lock waits on a slow network.
 */
export async function appendPiece(
  ctx: AppContext,
  call: Call,
  userId: string,
  piece: { partId: string; deviceId: string; offset: number; spool: string },
): Promise<number> {
  const size = (await stat(piece.spool)).size;
  if (size > PIECE_MAX_BYTES)
    throw new AppError(413, 'too_large', tr('That piece of the recording is too large.'));
  const storage = storageFor(ctx.config);
  const now = ctx.now();
  const result = await ctx.db.transaction().execute(async (trx) => {
    const part = await trx
      .selectFrom('call_recording_parts')
      .select(['id', 'notes_id', 'recorder_id', 'recorder_device', 'state', 'storage_key', 'bytes'])
      .where('id', '=', piece.partId)
      .where('call_id', '=', call.id)
      .forUpdate()
      .executeTakeFirst();
    if (!part) throw notFound(tr('That recording'));
    if (part.recorder_id !== userId || part.recorder_device !== piece.deviceId)
      throw notRecording();
    if (part.state !== 'recording')
      throw new AppError(409, 'conflict', tr('That part of the recording has ended.'));
    const notes = await trx
      .selectFrom('call_notes')
      .select(['state', 'why', 'stopped_at', 'recording_deleted_at'])
      .where('id', '=', part.notes_id)
      .executeTakeFirstOrThrow();
    if (notes.recording_deleted_at || !mayStillTake(notes, now))
      throw forbidden(tr('Cai isn’t recording that call any more.'));
    const had = Number(part.bytes);
    if (piece.offset !== had)
      throw new AppError(409, 'offset_mismatch', tr('Resume from the server’s offset.'), {
        offset: had,
      });
    // At its largest the part ends here: the device begins another.
    if (had + size > PART_MAX_BYTES) return { full: true, offset: had };
    const written = await storage.append(part.storage_key, createReadStream(piece.spool));
    await trx
      .updateTable('call_recording_parts')
      .set({ bytes: written, last_piece_at: now })
      .where('id', '=', part.id)
      .execute();
    return { full: false, offset: written };
  });
  if (result.full) {
    await finishPart(ctx, call, userId, piece.partId, piece.deviceId);
    throw new AppError(413, 'too_large', tr('That part of the recording is as long as it can be.'));
  }
  return result.offset;
}

/** A part ended by its recorder: made ready to play at once. */
export async function finishPart(
  ctx: AppContext,
  call: Call,
  userId: string,
  partId: string,
  deviceId: string,
): Promise<void> {
  const ended = await ctx.db
    .updateTable('call_recording_parts')
    .set({ state: 'finishing', ended_at: ctx.now() })
    .where('id', '=', partId)
    .where('call_id', '=', call.id)
    .where('recorder_id', '=', userId)
    .where('recorder_device', '=', deviceId)
    .where('state', '=', 'recording')
    .returning('id')
    .executeTakeFirst();
  if (!ended) return;
  await enqueue(
    ctx,
    RECORDING_FINISH_JOB,
    { partId },
    { dedupeKey: `${RECORDING_FINISH_JOB}:${partId}`, maxAttempts: 3 },
  );
}

/** Where a finished part is kept: by month, as files are. */
function keptKey(id: string, now: Date): string {
  return `recordings/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
}

/** What making a part seekable came to (`remux`). */
export type Remuxed =
  /** Its tracks copied into an MP4 with its index. */
  | { kind: 'copied'; mime: string; durationMs: number | null }
  /** Readable, but not without re-encoding: kept as it was recorded. */
  | { kind: 'as_recorded'; durationMs: number | null }
  /** Nothing in it could be read. */
  | { kind: 'unreadable' };

/**
 * A recording made seekable without re-encoding (R114 (4)): its tracks copied as they are into an
 * MP4 with its index at the end, written as it goes (never held in memory whole), which every
 * phone and browser seeks in. A track an MP4 can't carry as it is leaves the part as it was.
 */
export async function remux(from: string, to: string): Promise<Remuxed> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.FilePathSource(from), formats: mb.ALL_FORMATS });
  try {
    let tracks: Awaited<ReturnType<typeof input.getTracks>>;
    let durationMs: number | null = null;
    try {
      tracks = await input.getTracks();
      const seconds = await input.computeDuration();
      if (Number.isFinite(seconds) && seconds > 0) durationMs = Math.round(seconds * 1000);
    } catch {
      return { kind: 'unreadable' };
    }
    // No track, or none with a moment in it (a header and nothing after): nothing to play.
    if (!tracks.length || !durationMs) return { kind: 'unreadable' };
    try {
      const output = new mb.Output({
        format: new mb.Mp4OutputFormat({ fastStart: false }),
        target: new mb.FilePathTarget(to),
      });
      const conversion = await mb.Conversion.init({
        input,
        output,
        video: { forceTranscode: false },
        audio: { forceTranscode: false },
      });
      // A track it would have to re-encode (or drop) means it isn't a copy.
      if (!conversion.isValid || conversion.discardedTracks.length)
        return { kind: 'as_recorded', durationMs };
      await conversion.execute();
    } catch {
      return { kind: 'as_recorded', durationMs };
    }
    return {
      kind: 'copied',
      mime: tracks.some((t) => t.isVideoTrack()) ? 'video/mp4' : 'audio/mp4',
      durationMs,
    };
  } finally {
    input.dispose();
  }
}

async function finish(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const partId = String(payload.partId ?? '');
  if (!partId) return;
  const now = ctx.now();
  // A late finish (the notes stopped, the recorder moved, or a sweep) takes a part still being
  // recorded only once its recorder has stopped sending to it.
  if (payload.late === true) {
    const part = await ctx.db
      .selectFrom('call_recording_parts as p')
      .innerJoin('call_notes as n', 'n.id', 'p.notes_id')
      .select([
        'p.state',
        'p.recorder_device',
        'p.last_piece_at',
        'p.created_at',
        'n.state as notes_state',
        'n.recorder_device as notes_recorder',
      ])
      .where('p.id', '=', partId)
      .executeTakeFirst();
    if (part?.state !== 'recording') return;
    const quiet = now.getTime() - (part.last_piece_at ?? part.created_at).getTime() > LATE_MS;
    const theirs = part.notes_state === 'on' && part.notes_recorder === part.recorder_device;
    if (theirs && !quiet) return;
    await ctx.db
      .updateTable('call_recording_parts')
      .set({ state: 'finishing', ended_at: part.last_piece_at ?? now })
      .where('id', '=', partId)
      .where('state', '=', 'recording')
      .execute();
  }
  const part = await ctx.db
    .selectFrom('call_recording_parts')
    .select(['id', 'call_id', 'storage_key', 'bytes', 'mime', 'state'])
    .where('id', '=', partId)
    .executeTakeFirst();
  if (part?.state !== 'finishing') return;
  const storage = storageFor(ctx.config);
  if (Number(part.bytes) === 0) {
    // Nothing was ever sent: no part.
    await ctx.db.deleteFrom('call_recording_parts').where('id', '=', part.id).execute();
    await storage.remove(part.storage_key).catch(() => undefined);
    return;
  }
  const outKey = `tmp/recording-${part.id}.mp4`;
  const made = await remux(storage.path(part.storage_key), storage.path(outKey));
  if (made.kind === 'unreadable') {
    // Nothing of it plays: said so, and its bytes go.
    await storage.remove(outKey).catch(() => undefined);
    await storage.remove(part.storage_key).catch(() => undefined);
    await ctx.db
      .updateTable('call_recording_parts')
      .set({ state: 'failed', bytes: 0 })
      .where('id', '=', part.id)
      .where('state', '=', 'finishing')
      .execute();
    ctx.metrics.callRecordings.inc({ outcome: 'failed' });
    await tellReaders(ctx, part.call_id);
    return;
  }
  const key = keptKey(part.id, now);
  if (made.kind === 'copied') {
    await storage.moveFrom(outKey, key);
    await storage.remove(part.storage_key).catch(() => undefined);
  } else {
    await storage.remove(outKey).catch(() => undefined);
    await storage.moveFrom(part.storage_key, key);
  }
  const bytes = (await storage.size(key)) ?? Number(part.bytes);
  const kept = await ctx.db
    .updateTable('call_recording_parts')
    .set({
      state: 'ready',
      storage_key: key,
      mime: made.kind === 'copied' ? made.mime : part.mime,
      bytes,
      duration_ms: made.durationMs,
    })
    .where('id', '=', part.id)
    .where('state', '=', 'finishing')
    .returning('id')
    .executeTakeFirst();
  // Deleted or erased meanwhile: nothing of it stays.
  if (!kept) {
    await storage.remove(key).catch(() => undefined);
    return;
  }
  ctx.metrics.callRecordings.inc({
    outcome: made.kind === 'copied' ? 'ready' : 'kept_as_recorded',
  });
  await tellReaders(ctx, part.call_id);
}

/**
 * Who plays a part (and sees its frames, M17 I13h): a 1:1 call's two, once it was answered; in a
 * group call, whoever had joined by the time it began on the server's clock (R85 (2): never what
 * came before they joined).
 */
export async function readerOf(
  db: Db,
  call: Call,
  viewerId: string,
): Promise<(p: { created_at: Date }) => boolean> {
  if (!call.is_group) {
    const inIt = call.caller_id === viewerId || call.callee_id === viewerId;
    return () => Boolean(inIt && call.answered_at);
  }
  const me = await db
    .selectFrom('call_members')
    .select('joined_at')
    .where('call_id', '=', call.id)
    .where('user_id', '=', viewerId)
    .executeTakeFirst();
  const joined = me?.joined_at;
  return (p) => Boolean(joined && joined.getTime() <= p.created_at.getTime());
}

/** Whoever plays any of the call's recording hears that it changed. */
async function tellReaders(ctx: AppContext, callId: string): Promise<void> {
  const call = await ctx.db
    .selectFrom('calls')
    .select(['id', 'is_group', 'caller_id', 'callee_id'])
    .where('id', '=', callId)
    .executeTakeFirst();
  if (!call) return;
  const to = call.is_group
    ? (
        await ctx.db
          .selectFrom('call_members')
          .select('user_id')
          .where('call_id', '=', callId)
          .where('joined_at', 'is not', null)
          .execute()
      ).map((m) => m.user_id)
    : [call.caller_id, call.callee_id].filter((id): id is string => Boolean(id));
  if (to.length) await ctx.bus.publish(to, { type: 'callnotes.changed', data: { callId } });
}

/**
 * A share of the recording (R114 (7), M17 I13e): read through the share's message, the parts its
 * sharer could play, by the share's own addresses.
 */
export interface ShareVia {
  messageId: string;
  sharedBy: string;
}

/**
 * The call's recording as this person may play it: the parts they were in the call for, or,
 * through a share (`via`), the parts its sharer was.
 */
export async function recordingFor(
  ctx: AppContext,
  call: Call,
  viewerId: string,
  via?: ShareVia,
): Promise<CallRecordingView | null> {
  const notes = await ctx.db
    .selectFrom('call_notes')
    .select(['state', 'started_by', 'kept_by', 'recording_until', 'recording_deleted_at'])
    .where('call_id', '=', call.id)
    .where('records', '=', true)
    .execute();
  if (!notes.length) return null;
  if (notes.some((n) => n.recording_deleted_at))
    return { state: 'deleted', until: null, keptBy: null, mayKeep: false, parts: [], frames: [] };
  const reads = await readerOf(ctx.db, call, via?.sharedBy ?? viewerId);
  const parts = (
    await ctx.db
      .selectFrom('call_recording_parts')
      .select([
        'id',
        'kind',
        'shown_by',
        'started_at',
        'ended_at',
        'duration_ms',
        'state',
        'mime',
        'bytes',
        'created_at',
      ])
      .where('call_id', '=', call.id)
      .where('state', '<>', 'deleted')
      .orderBy('started_at')
      .orderBy('id')
      .execute()
  ).filter(reads);
  const live = notes.some((n) => n.state === 'on');
  if (!parts.length && !live) return null;
  // What each shown screen showed (M17 I13h): the frames of the screen parts this reader plays.
  const screens = parts.filter((p) => p.kind === 'screen');
  const frames = screens.length
    ? await ctx.db
        .selectFrom('call_recording_frames')
        .select(['id', 'part_id', 'at_ms', 'read'])
        .where(
          'part_id',
          'in',
          screens.map((p) => p.id),
        )
        .orderBy('at_ms')
        .orderBy('id')
        .execute()
    : [];
  const keptBy = notes.find((n) => n.kept_by)?.kept_by ?? null;
  const shownBy = [
    ...new Set([...parts.map((p) => p.shown_by), keptBy].filter((id): id is string => Boolean(id))),
  ];
  const [shown, names] = await Promise.all([
    personViewsFor(ctx, viewerId, shownBy),
    shownBy.length
      ? ctx.db
          .selectFrom('users')
          .select(['id', 'display_name'])
          .where('id', 'in', shownBy)
          .execute()
      : Promise.resolve([]),
  ]);
  const nameOf = new Map(names.map((u) => [u.id, u.display_name]));
  const person = (id: string | null): CallPersonView | null =>
    id
      ? {
          id,
          displayName: shown.get(id)?.displayName ?? nameOf.get(id) ?? tr('Deleted account'),
          avatarUrl: shown.get(id)?.avatarUrl ?? null,
        }
      : null;
  const until = notes
    .map((n) => n.recording_until?.getTime())
    .filter((t): t is number => typeof t === 'number');
  const view: CallRecordingPartView[] = parts.map((p) => ({
    id: p.id,
    kind: p.kind,
    shownBy: person(p.shown_by),
    startedAt: p.started_at.toISOString(),
    endedAt: p.ended_at?.toISOString() ?? null,
    durationMs: p.duration_ms,
    state: p.state === 'deleted' ? 'failed' : p.state,
    mime: p.mime,
    bytes: Number(p.bytes),
    url:
      p.state !== 'ready'
        ? null
        : via
          ? `/v1/messages/${via.messageId}/recording/${p.id}`
          : `/v1/calls/${call.id}/recording/${p.id}`,
  }));
  const state =
    live || view.some((p) => p.state === 'recording' || p.state === 'finishing')
      ? 'recording'
      : 'recorded';
  const partOf = new Map(parts.map((p) => [p.id, p]));
  return {
    state,
    until: keptBy || !until.length ? null : new Date(Math.min(...until)).toISOString(),
    keptBy: person(keptBy),
    // Whoever asked keeps it or lets it go, once it's recorded (M17 I13d); never from a share.
    mayKeep: !via && state === 'recorded' && notes.some((n) => n.started_by === viewerId),
    parts: view,
    frames: frames.flatMap((f) => {
      const part = partOf.get(f.part_id);
      if (!part) return [];
      return [
        {
          id: f.id,
          partId: f.part_id,
          at: new Date(part.started_at.getTime() + f.at_ms).toISOString(),
          shownBy: person(part.shown_by),
          read: f.read?.trim() ? f.read : null,
          url: via
            ? `/v1/messages/${via.messageId}/recording/frames/${f.id}`
            : `/v1/calls/${call.id}/recording/frames/${f.id}`,
        },
      ];
    }),
  };
}

/**
 * Whoever asked Cai to record the call keeps its recording past its day, or lets it go (M17
 * I13d, R114 (6)): kept, its bytes count against their storage (counted under their lock, as a
 * file is), never past an organization's retention, which is the organization's own promise
 * (R54); let go, it goes at its day, or at the next sweep when that has passed. Only once it's
 * recorded, so what's counted is all of it.
 */
export async function keepRecording(
  ctx: AppContext,
  call: Call,
  userId: string,
  keep: boolean,
): Promise<void> {
  const now = ctx.now();
  const changed = await ctx.db.transaction().execute(async (trx) => {
    await lockStorage(trx, userId);
    const notes = await trx
      .selectFrom('call_notes')
      .select(['id', 'state', 'started_by', 'kept_by', 'recording_deleted_at'])
      .where('call_id', '=', call.id)
      .where('records', '=', true)
      .forNoKeyUpdate()
      .execute();
    if (!notes.length || notes.some((n) => n.recording_deleted_at))
      throw notFound(tr('That recording'));
    const mine = notes.filter((n) => n.started_by === userId);
    if (!mine.length)
      throw forbidden(tr('Only whoever asked Cai to record this call may keep its recording.'));
    const parts = await trx
      .selectFrom('call_recording_parts')
      .select(['state', 'bytes'])
      .where(
        'notes_id',
        'in',
        mine.map((n) => n.id),
      )
      .where('state', '<>', 'deleted')
      .execute();
    if (
      notes.some((n) => n.state === 'on' || n.state === 'asking') ||
      parts.some((p) => p.state === 'recording' || p.state === 'finishing')
    )
      throw new AppError(
        409,
        'conflict',
        tr('The recording can be kept once the call is over and it’s ready to play.'),
      );
    const ids = mine.map((n) => n.id);
    if (keep) {
      if (mine.every((n) => n.kept_by === userId)) return false;
      if ((await retentionFor(trx, call.conversation_id, null)) !== null)
        throw new AppError(
          409,
          'conflict',
          tr(
            'This organization keeps its conversations for a set time, so the recording can’t be kept past its day.',
          ),
        );
      const bytes = parts.reduce((sum, p) => sum + Number(p.bytes), 0);
      await assertStorage(ctx, userId, bytes, trx);
      await trx
        .updateTable('call_notes')
        .set({ kept_by: userId, kept_at: now })
        .where('id', 'in', ids)
        .execute();
      return true;
    }
    if (!mine.some((n) => n.kept_by)) return false;
    await trx
      .updateTable('call_notes')
      .set({
        kept_by: null,
        kept_at: null,
        recording_until: sql`greatest(recording_until, ${now})`,
      })
      .where('id', 'in', ids)
      .execute();
    return true;
  });
  if (!changed) return;
  ctx.metrics.callRecordings.inc({ outcome: keep ? 'kept' : 'let_go' });
  await tellReaders(ctx, call.id);
}

/**
 * A part this person may play, ready: its stored bytes, else not found. Through a share (`via`),
 * one its sharer could play.
 */
export async function playablePart(
  ctx: AppContext,
  call: Call,
  viewerId: string,
  partId: string,
  via?: ShareVia,
) {
  const part = await ctx.db
    .selectFrom('call_recording_parts as p')
    .innerJoin('call_notes as n', 'n.id', 'p.notes_id')
    .select(['p.storage_key', 'p.mime', 'p.bytes', 'p.kind', 'p.created_at', 'p.started_at'])
    .where('p.id', '=', partId)
    .where('p.call_id', '=', call.id)
    .where('p.state', '=', 'ready')
    .where('n.recording_deleted_at', 'is', null)
    .executeTakeFirst();
  if (!part || !(await readerOf(ctx.db, call, via?.sharedBy ?? viewerId))(part))
    throw notFound(tr('That recording'));
  const day = part.started_at.toISOString().slice(0, 10);
  const ext = part.mime.endsWith('mp4') ? 'mp4' : part.mime.endsWith('ogg') ? 'ogg' : 'webm';
  return {
    storage_key: part.storage_key,
    mime: part.mime,
    size: part.bytes,
    name: `${part.kind === 'screen' ? 'screen' : 'call'}-${day}.${ext}`,
  };
}

/**
 * Every share of these calls' recordings goes with them (R114 (7), M17 I13e): each removed for
 * everyone in the conversation it was shared into, as any message taken down.
 */
async function dropSharesOf(
  ctx: AppContext,
  callIds: string[],
  actorId: string | null,
): Promise<number> {
  if (!callIds.length) return 0;
  const shares = await ctx.db
    .selectFrom('call_recording_shares as s')
    .innerJoin('messages as m', 'm.id', 's.message_id')
    .select(['m.id', 'm.conversation_id', 'm.pinned_at'])
    .where('s.call_id', 'in', callIds)
    .where('m.deleted_at', 'is', null)
    .execute();
  for (const m of shares) await removeForEveryone(ctx, m, actorId);
  if (shares.length) ctx.metrics.callRecordings.inc({ outcome: 'share_gone' }, shares.length);
  return shares.length;
}

/**
 * Delete these notes' recording for everyone: its bytes go, and every share of it, the notes
 * stay. Says how many parts went.
 */
async function dropRecording(
  ctx: AppContext,
  notesIds: string[],
  why: string,
  actorId: string | null = null,
): Promise<number> {
  if (!notesIds.length) return 0;
  const { keys, callIds } = await ctx.db.transaction().execute(async (trx) => {
    const calls = await trx
      .selectFrom('call_notes')
      .select('call_id')
      .distinct()
      .where('id', 'in', notesIds)
      .execute();
    await trx
      .updateTable('call_notes')
      .set({ recording_deleted_at: ctx.now() })
      .where('id', 'in', notesIds)
      .where('recording_deleted_at', 'is', null)
      .execute();
    const parts = await trx
      .updateTable('call_recording_parts')
      .set({ state: 'deleted', bytes: 0 })
      .where('notes_id', 'in', notesIds)
      .where('state', '<>', 'deleted')
      .returning('storage_key')
      .execute();
    // The frames of its shown screens go with it (M17 I13h).
    const frames = await trx
      .deleteFrom('call_recording_frames')
      .where('notes_id', 'in', notesIds)
      .returning('storage_key')
      .execute();
    return {
      keys: [...parts, ...frames].map((p) => p.storage_key),
      callIds: calls.map((c) => c.call_id),
    };
  });
  const storage = storageFor(ctx.config);
  for (const key of keys)
    await storage.remove(key).catch((err) => ctx.log.warn({ err, key }, `${why}: not removed`));
  await dropSharesOf(ctx, callIds, actorId);
  return keys.length;
}

/**
 * Anyone who was in the call deletes its recording for everyone (R52, R114 (6)); while it's being
 * recorded, that stops Cai first (the notes' Stop), so nothing more is taken.
 */
export async function deleteRecording(ctx: AppContext, call: Call, userId: string): Promise<void> {
  if (!(await readersOf(ctx.db, call)).has(userId)) throw notFound(tr('That recording'));
  const notes = await ctx.db
    .selectFrom('call_notes')
    .select(['id', 'state'])
    .where('call_id', '=', call.id)
    .where('records', '=', true)
    .execute();
  if (!notes.length) throw notFound(tr('That recording'));
  if (notes.some((n) => n.state === 'on' || n.state === 'asking'))
    await stopNotes(ctx, call, userId, { all: true });
  await dropRecording(
    ctx,
    notes.map((n) => n.id),
    'recording deleted',
    userId,
  );
  ctx.metrics.callRecordings.inc({ outcome: 'deleted' });
  await tellReaders(ctx, call.id);
}

/**
 * A share whose recording went any other way (the call's line erased with it) goes at the next
 * sweep (R114 (7)): the tile reads as gone until then.
 */
async function sweepGoneShares(ctx: AppContext): Promise<void> {
  for (;;) {
    const gone = await ctx.db
      .selectFrom('call_recording_shares as s')
      .innerJoin('messages as m', 'm.id', 's.message_id')
      .select(['m.id', 'm.conversation_id', 'm.pinned_at'])
      .where('m.deleted_at', 'is', null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('call_notes as n')
              .select('n.id')
              .whereRef('n.call_id', '=', 's.call_id')
              .where('n.records', '=', true)
              .where('n.recording_deleted_at', 'is', null),
          ),
        ),
      )
      .limit(SWEEP_BATCH)
      .execute();
    for (const m of gone) await removeForEveryone(ctx, m, null);
    if (gone.length) ctx.metrics.callRecordings.inc({ outcome: 'share_gone' }, gone.length);
    if (gone.length < SWEEP_BATCH) break;
  }
}

/**
 * Daily: recordings past their day go for everyone (R114 (6)), with every share of them, a share
 * whose recording went any other way goes too, and a part whose recorder went quiet without
 * ending it is finished with what it sent.
 */
export async function sweepRecordings(ctx: AppContext): Promise<void> {
  const now = ctx.now();
  for (;;) {
    const due = await ctx.db
      .selectFrom('call_notes')
      .select('id')
      .where('records', '=', true)
      .where('recording_deleted_at', 'is', null)
      .where('kept_by', 'is', null)
      .where('recording_until', '<', now)
      .limit(SWEEP_BATCH)
      .execute();
    if (!due.length) break;
    await dropRecording(
      ctx,
      due.map((n) => n.id),
      'recording expired',
    );
    ctx.metrics.callRecordings.inc({ outcome: 'expired' }, due.length);
    if (due.length < SWEEP_BATCH) break;
  }
  await sweepGoneShares(ctx);
  const stale = await ctx.db
    .selectFrom('call_recording_parts')
    .select('id')
    .where('state', '=', 'recording')
    .where('created_at', '<', new Date(now.getTime() - STALE_MS))
    .where((eb) =>
      eb.or([
        eb('last_piece_at', 'is', null),
        eb('last_piece_at', '<', new Date(now.getTime() - STALE_MS)),
      ]),
    )
    .limit(SWEEP_BATCH)
    .execute();
  for (const part of stale)
    await enqueue(
      ctx,
      RECORDING_FINISH_JOB,
      { partId: part.id, late: true },
      { dedupeKey: `${RECORDING_FINISH_JOB}:stale:${part.id}`, maxAttempts: 3 },
    );
}

export { finishOpenParts };

export function registerRecordingJobs(): void {
  registerJob(RECORDING_FINISH_JOB, finish, { timeoutMs: 10 * 60_000 });
  registerPeriodic({
    name: 'call-recordings',
    everyMs: 86_400_000,
    background: true,
    run: sweepRecordings,
  });
}
