/**
 * A voice note into words (PRD §46): queued when a voice message is sent, run by a job, kept as
 * the message's `body` (so it's searched, previewed and erased exactly as written words are) with
 * `payload.transcript` saying who heard it and when, and shown to everyone in the conversation
 * under the note. Only when the sender has AI assist on (an adult, within their day's allowance,
 * counted as one assist), never from a private conversation, never for a note longer than a
 * voice note. Every call is one `ai_runs` row (`feature: transcribe`), through `runAi`.
 */
import { isMinor } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { runAi } from './ai-run';
import { AppError } from './errors';
import { enqueue, registerJob } from './jobs';
import { messageViews, participantsOf } from './messages';
import { assertAiAllowance } from './plans';
import { SPEECH_MAX_BYTES, SPEECH_MAX_MS } from './speech';
import { storageFor } from './storage';

export const TRANSCRIBE_JOB = 'speech.transcribe';

/** What a transcript keeps beside the words, on the message's payload. */
export interface TranscriptMark {
  language: string | null;
  by: string;
  at: string;
}

/** Queue a just-sent voice note for words, when this Caime and its sender allow it. */
export async function queueTranscription(ctx: AppContext, message: Message): Promise<void> {
  if (message.kind !== 'voice' || message.sealed || !message.sender_id) return;
  if (!ctx.speech) return;
  await enqueue(
    ctx,
    TRANSCRIBE_JOB,
    { messageId: message.id },
    { dedupeKey: `${TRANSCRIBE_JOB}:${message.id}`, maxAttempts: 3 },
  );
}

/** The language hints for a note: the sender's interface language, when it's one Caime knows. */
function hintsFor(
  language: string | null | undefined,
  locale: string | null | undefined,
): string[] {
  const chosen = language && language !== 'auto' ? language : (locale ?? '').slice(0, 2);
  return chosen === 'ar' || chosen === 'en' || chosen === 'fr' ? [chosen] : [];
}

async function transcribe(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const speech = ctx.speech;
  const messageId = String(payload.messageId ?? '');
  if (!speech || !messageId) return;
  const m = await ctx.db
    .selectFrom('messages')
    .selectAll()
    .where('id', '=', messageId)
    .executeTakeFirst();
  // Gone, emptied, sealed, or already in words: nothing to do.
  if (!m || m.deleted_at || m.sealed || m.kind !== 'voice' || m.body || !m.sender_id) return;
  const sender = await ctx.db
    .selectFrom('users')
    .select(['id', 'ai_enabled', 'birth_date', 'time_zone', 'locale', 'preferences'])
    .where('id', '=', m.sender_id)
    .executeTakeFirst();
  if (!sender?.ai_enabled || isMinor(sender.birth_date, ctx.now(), sender.time_zone)) return;
  const file = await ctx.db
    .selectFrom('message_files as mf')
    .innerJoin('files as f', 'f.id', 'mf.file_id')
    .selectAll('f')
    .where('mf.message_id', '=', m.id)
    .where('f.kind', '=', 'audio')
    .where('f.status', '=', 'ready')
    .orderBy('f.created_at')
    .executeTakeFirst();
  if (!file) return;
  // `size` is a bigint column, read as text.
  const size = Number(file.size);
  if ((file.duration_ms ?? 0) > SPEECH_MAX_MS || size > SPEECH_MAX_BYTES) return;
  try {
    await assertAiAllowance(ctx, sender.id);
  } catch (err) {
    // Out of assists today: the note stays as it is, and nothing is said (it was never promised).
    if (err instanceof AppError) return;
    throw err;
  }
  const bytes = await readAll(ctx, file.storage_key, size);
  const prefs = (sender.preferences ?? {}) as { language?: string };
  let transcript: Awaited<ReturnType<typeof speech.transcribe>>['value'];
  try {
    transcript = await runAi(
      ctx,
      'transcribe',
      sender.id,
      () =>
        speech.transcribe({
          bytes,
          mime: file.mime,
          name: file.name,
          languageHints: hintsFor(prefs.language, sender.locale),
        }),
      speech.provider,
    );
  } catch (err) {
    // Nothing heard, or the provider declined: the note stays a note. Busy: the job tries again.
    if (err instanceof AppError && err.code === 'ai_busy') throw err;
    return;
  }
  const mark: TranscriptMark = {
    language: transcript.language,
    by: speech.provider,
    at: ctx.now().toISOString(),
  };
  const updated = await ctx.db
    .updateTable('messages')
    .set({
      body: transcript.text,
      payload: JSON.stringify({ ...(m.payload as Record<string, unknown>), transcript: mark }),
    })
    .where('id', '=', m.id)
    .where('body', 'is', null)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst();
  if (!updated) return;
  const members = (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id);
  for (const userId of members) {
    const [view] = await messageViews(ctx.db, [updated], userId);
    if (view)
      await ctx.bus.publish([userId], {
        type: 'message.updated',
        data: { ...view, clientId: null },
      });
  }
}

/** The whole file, from wherever this Caime keeps files, never past the cap. */
async function readAll(ctx: AppContext, key: string, size: number): Promise<Buffer> {
  const storage = storageFor(ctx.config);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of storage.read(key)) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += b.length;
    if (total > Math.min(size, SPEECH_MAX_BYTES))
      throw new AppError(413, 'too_large', tr('That recording is too long to transcribe.'));
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export function registerTranscribeJob(): void {
  registerJob(TRANSCRIBE_JOB, transcribe);
}
