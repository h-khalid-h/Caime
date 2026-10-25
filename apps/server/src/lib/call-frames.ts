/**
 * What was on a shared screen (R114 (1) and (4), M17 I13h). While Cai records a call, the
 * recording's browser keeps a frame of each screen shown at each change of it (the app's
 * `screenFrames.ts`: a small grey sample every two seconds, a change past a share of its cells
 * on two samples running) and sends it here as a JPEG at its moment into the screen's part. It
 * lands under the part's row lock as a piece does, only while the part is being recorded and the
 * notes are on (or within the minute a piece may still land), one every `FRAME_MIN_MS` at most
 * and `FRAMES_PER_PART_MAX` a part whatever the device says, its bytes through `images.run` (a
 * JPEG at most `FRAME_EDGE` wide, nothing of the device's metadata kept) to a key beside the
 * recording's. Whoever may play the part sees its frames (`recordingFor`, by the recording's
 * reader rule), the write-up reads up to `FRAMES_IN_NOTES` of them once (`screenLines`: the first,
 * the last and the rest spread evenly, each read by the light model on the asker's allowance and
 * kept as `read`, so a write-up written again reads nothing twice), and they go with the
 * recording (`dropRecording`), the call's line (`eraseMessagesWhere`) and the sweep. Nothing here
 * keeps a camera: the app samples a screen's track alone.
 */
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import {
  FRAME_EDGE,
  FRAME_MIN_MS,
  FRAMES_IN_NOTES,
  FRAMES_PER_PART_MAX,
  uuidv7,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import sharp from 'sharp';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import type { AiAssist } from './ai';
import { runAi } from './ai-run';
import { mayStillTake, readerOf, type ShareVia } from './call-recording';
import { AppError, badRequest, forbidden, notFound } from './errors';
import { IMAGE_PIXELS_MAX, images } from './renditions';
import { storageFor } from './storage';

/** The most a frame may be as sent: a screen at 1280 wide is well under a megabyte. */
export const FRAME_MAX_BYTES = 2 * 1024 * 1024;
const QUALITY = 80;

/**
 * A picture of a screen as Caime keeps or reads it: decoded through `images.run`, at most
 * `FRAME_EDGE` wide, a JPEG with nothing of the device's metadata; null for one that can't be read.
 */
export async function shrinkFrame(spool: string) {
  return images
    .run(() =>
      sharp(spool, { limitInputPixels: IMAGE_PIXELS_MAX })
        .resize({ width: FRAME_EDGE, height: FRAME_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITY })
        .toBuffer({ resolveWithObject: true }),
    )
    .catch(() => null);
}

const notRecording = () => forbidden(tr('This device isn’t recording that call.'));

/**
 * A frame of a shown screen, from the device recording: decoded first (outside any lock), then
 * kept under its part's row lock at the cadence the server holds. Answers the frame's id, or null
 * for one that came too soon after the last or past the part's most: not an error, since the
 * device's cadence and the server's agree, and a retry never doubles one.
 */
export async function addFrame(
  ctx: AppContext,
  call: Call,
  userId: string,
  frame: { partId: string; deviceId: string; at: number; spool: string },
): Promise<string | null> {
  const size = (await stat(frame.spool)).size;
  if (size > FRAME_MAX_BYTES)
    throw new AppError(413, 'too_large', tr('That picture of the screen is too large.'));
  const picture = await shrinkFrame(frame.spool);
  if (!picture) throw badRequest(tr('That isn’t a picture Caime reads.'));
  const storage = storageFor(ctx.config);
  const now = ctx.now();
  return ctx.db.transaction().execute(async (trx) => {
    const part = await trx
      .selectFrom('call_recording_parts')
      .select(['id', 'notes_id', 'kind', 'recorder_id', 'recorder_device', 'state'])
      .where('id', '=', frame.partId)
      .where('call_id', '=', call.id)
      .forUpdate()
      .executeTakeFirst();
    if (!part) throw notFound(tr('That recording'));
    if (part.recorder_id !== userId || part.recorder_device !== frame.deviceId)
      throw notRecording();
    if (part.kind !== 'screen') throw badRequest(tr('Only a shown screen has frames.'));
    if (part.state !== 'recording')
      throw new AppError(409, 'conflict', tr('That part of the recording has ended.'));
    const notes = await trx
      .selectFrom('call_notes')
      .select(['state', 'why', 'stopped_at', 'recording_deleted_at'])
      .where('id', '=', part.notes_id)
      .executeTakeFirstOrThrow();
    if (notes.recording_deleted_at || !mayStillTake(notes, now))
      throw forbidden(tr('Cai isn’t recording that call any more.'));
    const had = await trx
      .selectFrom('call_recording_frames')
      .select((eb) => [
        eb.fn.countAll<string>().as('count'),
        eb.fn.max<number | null>('at_ms').as('last'),
      ])
      .where('part_id', '=', part.id)
      .executeTakeFirstOrThrow();
    // The cadence is the server's: one every FRAME_MIN_MS, in order, FRAMES_PER_PART_MAX a part.
    if (Number(had.count) >= FRAMES_PER_PART_MAX) return null;
    if (had.last !== null && frame.at < had.last + FRAME_MIN_MS) return null;
    const id = uuidv7();
    const key = `recordings/frames/${part.notes_id}/${id}.jpg`;
    await trx
      .insertInto('call_recording_frames')
      .values({
        id,
        part_id: part.id,
        notes_id: part.notes_id,
        call_id: call.id,
        at_ms: frame.at,
        storage_key: key,
        bytes: picture.data.length,
        width: picture.info.width,
        height: picture.info.height,
        created_at: now,
      })
      .execute();
    await storage.write(key, Readable.from(picture.data));
    ctx.metrics.callRecordings.inc({ outcome: 'frame' });
    return id;
  });
}

/**
 * A frame as whoever may play its part reads it (or, through a share, as its sharer could): for
 * `streamFile`.
 */
export async function playableFrame(
  ctx: AppContext,
  call: Call,
  viewerId: string,
  frameId: string,
  via?: ShareVia,
) {
  const frame = await ctx.db
    .selectFrom('call_recording_frames as f')
    .innerJoin('call_recording_parts as p', 'p.id', 'f.part_id')
    .innerJoin('call_notes as n', 'n.id', 'f.notes_id')
    .select(['f.storage_key', 'f.bytes', 'f.at_ms', 'p.created_at', 'p.started_at'])
    .where('f.id', '=', frameId)
    .where('f.call_id', '=', call.id)
    .where('p.state', '<>', 'deleted')
    .where('n.recording_deleted_at', 'is', null)
    .executeTakeFirst();
  if (!frame || !(await readerOf(ctx.db, call, via?.sharedBy ?? viewerId))(frame))
    throw notFound(tr('That recording'));
  const day = frame.started_at.toISOString().slice(0, 10);
  return {
    storage_key: frame.storage_key,
    mime: 'image/jpeg',
    size: frame.bytes,
    name: `screen-${day}-${Math.round(frame.at_ms / 1000)}s.jpg`,
  };
}

/** A frame as a line of the write-up: whose screen, when, and what Cai read of it. */
export interface ScreenLine {
  id: string;
  speakerId: string;
  speaker: string;
  text: string;
  at: Date;
}

/** Of `n` frames in time order, which the write-up reads: the first, the last, the rest spread. */
export function framesToRead(n: number, most = FRAMES_IN_NOTES): number[] {
  if (n <= most) return Array.from({ length: n }, (_, i) => i);
  const picks = new Set<number>();
  for (let k = 0; k < most; k++) picks.add(Math.round((k * (n - 1)) / (most - 1)));
  return [...picks].sort((a, b) => a - b);
}

/** A frame's bytes, as the model is sent them. */
export async function base64Of(ctx: AppContext, key: string): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of storageFor(ctx.config).read(key)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('base64');
}

/**
 * What the screens shared in a call showed, as lines for its write-up (M17 I13h): up to
 * `FRAMES_IN_NOTES` of the frames kept with its recording, each read once by the light model on
 * the asker's allowance and kept as `read`, in the write-up's language. A frame the model
 * declined or couldn't read is left out and never asked again here (its `read` stays null); a
 * busy model or the day's allowance spent stops the reading and reaches the caller, which puts
 * the write-up off as it does for its own call.
 */
export async function screenLines(
  ctx: AppContext,
  call: Call,
  ai: AiAssist,
  askerId: string,
  language: string,
): Promise<ScreenLine[]> {
  const frames = await ctx.db
    .selectFrom('call_recording_frames as f')
    .innerJoin('call_recording_parts as p', 'p.id', 'f.part_id')
    .innerJoin('call_notes as n', 'n.id', 'f.notes_id')
    .leftJoin('users as u', 'u.id', 'p.shown_by')
    .select([
      'f.id',
      'f.at_ms',
      'f.storage_key',
      'f.read',
      'p.started_at',
      'p.shown_by',
      'u.display_name',
    ])
    .where('f.call_id', '=', call.id)
    .where('p.state', '<>', 'deleted')
    .where('n.recording_deleted_at', 'is', null)
    .orderBy('p.started_at')
    .orderBy('f.at_ms')
    .execute();
  if (!frames.length) return [];
  const lines: ScreenLine[] = [];
  for (const i of framesToRead(frames.length)) {
    const f = frames[i]!;
    let read = f.read;
    if (read === null) {
      try {
        read = await runAi(ctx, 'frame', askerId, async () =>
          ai.readFrame({
            image: { data: await base64Of(ctx, f.storage_key), mediaType: 'image/jpeg' },
            language,
          }),
        );
      } catch (err) {
        if (err instanceof AppError && (err.code === 'ai_busy' || err.status === 429)) throw err;
        if (!(err instanceof AppError)) ctx.log.warn({ err, frameId: f.id }, 'frame not read');
        // Declined, or unreadable: a frame Cai has nothing to say of, left for good.
        read = '';
      }
      await ctx.db
        .updateTable('call_recording_frames')
        .set({ read })
        .where('id', '=', f.id)
        .execute();
    }
    if (!read.trim() || !f.shown_by) continue;
    lines.push({
      id: f.id,
      speakerId: f.shown_by,
      speaker: f.display_name ?? tr('Deleted account'),
      text: read,
      at: new Date(f.started_at.getTime() + f.at_ms),
    });
  }
  return lines;
}
