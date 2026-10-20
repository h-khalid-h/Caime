/**
 * Cai's notes in a call (M16 F7, R82 under R85): ask, answer, stop, the device recording sending
 * each thing said, and reading what was said. The rules are in lib/call-notes.ts; the audio of an
 * utterance is kept only until it's heard.
 */
import {
  type AiActionsView,
  type AiCatchUpView,
  CallNoteLineQuery,
  CallNotesAnswerBody,
  CallNotesAskBody,
  type CallNotesResponse,
  type CallNotesStateResponse,
  tr,
} from '@caime/core';
import type { OkResponse } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
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
import { AppError, badRequest } from '../lib/errors';
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
    await askNotes(ctx, call, auth.userId, body);
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
    return notesFor(ctx, call, auth.userId);
  });

  /** One's own words out of the notes (R85 (2)): the others keep theirs. */
  app.delete('/calls/:id/notes/lines/:lineId', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id, lineId } = parse(lineParam, req.params);
    const call = await callForNotes(ctx, id, auth.userId);
    await deleteOwnLine(ctx, call, lineId, auth.userId);
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
}
