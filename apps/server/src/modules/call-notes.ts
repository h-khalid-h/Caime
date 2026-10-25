/**
 * Cai's notes in a call (M16 F7, R82 under R85): ask, answer, stop, the device recording sending
 * each thing said, and reading what was said, with Cai's write-up of it for whoever heard it all
 * (M16 F7e); and, in the Record mode (R114, M17 I13b), the recording's parts sent in pieces,
 * played and deleted. The rules are in lib/call-notes.ts, lib/call-notes-summary.ts and
 * lib/call-recording.ts; the audio of an utterance is kept only until it's heard.
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  type AiActionsView,
  type AiCatchUpView,
  CallNoteLineQuery,
  CallNotesAnswerBody,
  CallNotesAskBody,
  type CallNotesResponse,
  type CallNotesStateResponse,
  CallRecordingDeviceQuery,
  CallRecordingPartBody,
  type CallRecordingPartResponse,
  CallRecordingPieceQuery,
  type CallRecordingPieceResponse,
  tr,
} from '@caime/core';
import type { OkResponse } from '@caime/core/api';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import {
  answerNotes,
  askNotes,
  callForNotes,
  deleteOwnLine,
  LINE_MAX_BYTES,
  LINE_TYPES,
  notesFor,
  notesViewOf,
  saveLine,
  stopNotes,
} from '../lib/call-notes';
import { catchUpOnNotes, findNoteFollowUps } from '../lib/call-notes-ai';
import { afterLineDeleted, summaryFor } from '../lib/call-notes-summary';
import {
  appendPiece,
  deleteRecording,
  finishPart,
  keepRecording,
  PIECE_MAX_BYTES,
  playablePart,
  recordingFor,
  startPart,
} from '../lib/call-recording';
import { AppError, badRequest } from '../lib/errors';
import { streamFile } from '../lib/file-stream';
import { storageFor } from '../lib/storage';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function callNotesRoutes(app: FastifyInstance, ctx: AppContext) {
  const callParam = z.object({ id: z.string().uuid() });
  const lineParam = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });

  /** How the notes stand now, read after the change. */
  const stateOf = async (callId: string, userId: string): Promise<CallNotesStateResponse> => ({
    notes: await notesViewOf(ctx.db, await callForNotes(ctx, callId, userId)),
  });

  /** Ask Cai to take notes in the call this device is in (R85 (1): the asker's own yes). */
  app.post('/calls/:id/notes', async (req): Promise<CallNotesStateResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(CallNotesAskBody, req.body);
    const call = await callForNotes(ctx, id, auth.userId);
    await askNotes(ctx, call, auth.userId, body, body.records);
    return stateOf(id, auth.userId);
  });

  /** Yes or no to the ask, on the device in the call. */
  app.post('/calls/:id/notes/answer', async (req): Promise<CallNotesStateResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(CallNotesAnswerBody, req.body);
    const call = await callForNotes(ctx, id, auth.userId);
    await answerNotes(ctx, call, auth.userId, body.answer, body);
    return stateOf(id, auth.userId);
  });

  /** Stop Cai for everyone, from now (R85 (2)). */
  app.post('/calls/:id/notes/stop', async (req): Promise<CallNotesStateResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const call = await callForNotes(ctx, id, auth.userId);
    await stopNotes(ctx, call, auth.userId);
    return stateOf(id, auth.userId);
  });

  /**
   * One thing said, from the device recording (R82 (2)): its audio as a file part, who said it
   * and when in the query. Only the recorder sends, only voices that said yes are kept, and the
   * length is the recording's own.
   */
  app.post('/calls/:id/notes/lines', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const q = parse(CallNoteLineQuery, req.query);
    // A few at a time from each of up to eight voices, a call of an hour or more.
    ctx.limiter.hit(`call-note-line:${id}`, ctx.config.isTest ? 10_000 : 600, 600_000);
    const call = await callForNotes(ctx, id, auth.userId);
    const part = await req.file({ limits: { fileSize: LINE_MAX_BYTES } });
    if (!part) throw badRequest(tr('Attach a recording.'));
    const bytes = await part.toBuffer();
    if (part.file.truncated)
      throw new AppError(413, 'too_large', tr('That recording is too long to transcribe.'));
    const mime = part.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!LINE_TYPES.includes(mime)) throw badRequest(tr('That isn’t a recording Caime reads.'));
    await saveLine(ctx, call, auth.userId, {
      deviceId: q.deviceId,
      speakerId: q.speakerId,
      at: new Date(q.at),
      bytes,
      mime,
    });
    return { ok: true };
  });

  /** What was said, for someone who was in the call, from when they joined. */
  app.get('/calls/:id/notes', async (req): Promise<CallNotesResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const call = await callForNotes(ctx, id, auth.userId);
    const [notes, written, recording] = await Promise.all([
      notesFor(ctx, call, auth.userId),
      summaryFor(ctx, call, auth.userId),
      recordingFor(ctx, call, auth.userId),
    ]);
    return { ...notes, ...written, recording };
  });

  /** One's own words out of the notes (R85 (2)): the others keep theirs. */
  app.delete('/calls/:id/notes/lines/:lineId', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id, lineId } = parse(lineParam, req.params);
    const call = await callForNotes(ctx, id, auth.userId);
    await deleteOwnLine(ctx, call, lineId, auth.userId);
    // What was drawn from those words goes, and Cai writes the notes again without them.
    await afterLineDeleted(ctx, call, lineId);
    return { ok: true };
  });

  /**
   * Cai on the notes, on ask (M16 F7d): a catch-up of what this person may read of them, kept
   * nowhere, and the follow-ups in them, offered as their own suggestions.
   */
  app.post('/calls/:id/notes/catch-up', async (req): Promise<AiCatchUpView> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    return catchUpOnNotes(ctx, await callForNotes(ctx, id, auth.userId), auth.userId);
  });
  app.post('/calls/:id/notes/follow-ups', async (req): Promise<AiActionsView> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    return findNoteFollowUps(ctx, await callForNotes(ctx, id, auth.userId), auth.userId);
  });

  // ---- The recording (R114 (4), M17 I13b) ------------------------------------------------

  const partParam = z.object({ id: z.string().uuid(), partId: z.string().uuid() });
  const storage = storageFor(ctx.config);

  /** A part begun on the device recording: everyone's voices from now, or a shared screen. */
  app.post('/calls/:id/recording/parts', async (req): Promise<CallRecordingPartResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(CallRecordingPartBody, req.body);
    ctx.limiter.hit(`call-recording-part:${id}`, ctx.config.isTest ? 1000 : 120, 3_600_000);
    const call = await callForNotes(ctx, id, auth.userId);
    return { partId: await startPart(ctx, call, auth.userId, body) };
  });

  /**
   * A part's next piece, about ten seconds of it, sent at the offset the device has sent up to
   * (`application/offset+octet-stream`, as a resumable upload's chunk). It lands in a file of its
   * own first, cut off at the most a piece may be, so the part's lock never waits on a network.
   */
  app.put(
    '/calls/:id/recording/parts/:partId',
    async (req): Promise<CallRecordingPieceResponse> => {
      const auth = requireAuth(req);
      const { id, partId } = parse(partParam, req.params);
      const q = parse(CallRecordingPieceQuery, req.query);
      // A piece every ten seconds from a voices part and up to eight screens, retries besides.
      ctx.limiter.hit(`call-recording-piece:${id}`, ctx.config.isTest ? 10_000 : 1200, 600_000);
      const call = await callForNotes(ctx, id, auth.userId);
      const spool = join(tmpdir(), `caime-piece-${randomUUID()}`);
      let seen = 0;
      const capped = new Transform({
        transform(chunk: Buffer, _enc, done) {
          seen += chunk.length;
          if (seen > PIECE_MAX_BYTES)
            done(new AppError(413, 'too_large', tr('That piece of the recording is too large.')));
          else done(null, chunk);
        },
      });
      try {
        await pipeline(req.body as Readable, capped, createWriteStream(spool));
        const offset = await appendPiece(ctx, call, auth.userId, {
          partId,
          deviceId: q.deviceId,
          offset: q.offset,
          spool,
        });
        return { offset };
      } finally {
        await rm(spool, { force: true });
      }
    },
  );

  /** A part ended by its recorder: made ready to play. */
  app.post('/calls/:id/recording/parts/:partId/finish', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id, partId } = parse(partParam, req.params);
    const q = parse(CallRecordingDeviceQuery, req.query);
    const call = await callForNotes(ctx, id, auth.userId);
    await finishPart(ctx, call, auth.userId, partId, q.deviceId);
    return { ok: true };
  });

  /** A part played, by byte ranges, for someone who was in the call when it began. */
  app.get('/calls/:id/recording/:partId', async (req, reply): Promise<FastifyReply> => {
    const auth = requireAuth(req);
    const { id, partId } = parse(partParam, req.params);
    const call = await callForNotes(ctx, id, auth.userId);
    const part = await playablePart(ctx, call, auth.userId, partId);
    // Kept by the browser an hour at most: a recording deleted for everyone stops playing.
    return streamFile(req, reply, storage, part, true, 'private, max-age=3600');
  });

  /** The recording deleted for everyone by someone who was in the call (R52); the notes stay. */
  app.delete('/calls/:id/recording', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const call = await callForNotes(ctx, id, auth.userId);
    await deleteRecording(ctx, call, auth.userId);
    return { ok: true };
  });

  /** Kept past its day by whoever asked, against their storage (M17 I13d); or let go again. */
  app.post('/calls/:id/recording/keep', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const call = await callForNotes(ctx, id, auth.userId);
    await keepRecording(ctx, call, auth.userId, true);
    return { ok: true };
  });
  app.delete('/calls/:id/recording/keep', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const call = await callForNotes(ctx, id, auth.userId);
    await keepRecording(ctx, call, auth.userId, false);
    return { ok: true };
  });
}
