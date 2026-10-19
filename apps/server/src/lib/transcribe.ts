/**
 * A voice note into words (PRD §46): queued when a voice message is sent, run by a job, kept as
 * the message's `body` (so it's searched, previewed and erased exactly as written words are) with
 * `payload.transcript` saying who heard it and when, and shown to everyone in the conversation
 * under the note. Only when the sender has AI assist on (an adult, within their day's allowance,
 * counted as one assist), never from a private conversation, never for a note longer than a
 * voice note. Every call is one `ai_runs` row (`feature: transcribe`), through `runAi`. The words
 * are then read as typed ones are (M16 G8): the dates, asks and promises in them, at the moment
 * they were said, and what follows from them is the message effects' (`afterTranscript`, handed
 * to `registerTranscribeJob`, so this module never imports them).
 */
import type { Analysis } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import { AiError } from './ai';
import { runAi } from './ai-run';
import { AppError } from './errors';
import { enqueue, registerJob } from './jobs';
import { analyseText, messageViews, participantsOf } from './messages';
import { assertAiAllowance } from './plans';
import { SPEECH_MAX_BYTES, SPEECH_MAX_MS } from './speech';
import { storageFor } from './storage';
import { minorOf } from './users';

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
  return chosen === 'ar' || chosen === 'en' || chosen === 'fr' || chosen === 'tr' ? [chosen] : [];
}

/** What a note's heard words lead to: the suggestions a text's would offer (M16 G8). */
export type HeardWords = (
  ctx: AppContext,
  message: Message,
  analysis: Analysis | null,
) => Promise<void>;

async function transcribe(
  ctx: AppContext,
  payload: Record<string, unknown>,
  heard: HeardWords,
): Promise<void> {
  const speech = ctx.speech;
  const messageId = String(payload.messageId ?? '');
  if (!speech || !messageId) return;
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', messageId)
    .executeTakeFirst();
  // Gone, emptied, sealed, or already in words: nothing to do.
  if (!m || m.deleted_at || m.sealed || m.kind !== 'voice' || m.body || !m.sender_id) return;
  const sender = await ctx.db
    .selectFrom('users')
    .select([
      'id',
      'ai_enabled',
      'birth_date',
      'time_zone',
      'age_minor_until',
      'locale',
      'preferences',
      'workweek',
      'country',
    ])
    .where('id', '=', m.sender_id)
    .executeTakeFirst();
  // Under 18 by the date of birth or by a check of their age (M16 B7): no model hears them.
  if (!sender?.ai_enabled || minorOf(sender, ctx.now())) return;
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
  // `size` is a bigint column, read as text. A recording that doesn't say how long it is isn't
  // sent: a provider bills by the minute, so the length is what bounds it (M16 H7).
  const size = Number(file.size);
  const audioMs = file.duration_ms;
  if (audioMs === null || audioMs > SPEECH_MAX_MS || size > SPEECH_MAX_BYTES) return;
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
      // Kept with its length, which is what the provider charges for (M16 H7).
      () =>
        speech
          .transcribe({
            bytes,
            mime: file.mime,
            name: file.name,
            languageHints: hintsFor(prefs.language, sender.locale),
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
  // Read as its sender's typed words would have been when it was sent (M16 G8): a voice note's
  // "tomorrow" is the day after it was said, and what it asks reads in the inbox as asked.
  const read = analyseText(transcript.text.trim(), sender, m.created_at);
  const updated = await ctx.db
    .updateTable('messages')
    .set({
      body: transcript.text,
      payload: JSON.stringify({ ...(m.payload as Record<string, unknown>), transcript: mark }),
      entities: JSON.stringify(read.entities),
      is_question: read.analysis?.isQuestion ?? false,
      is_request: read.analysis?.isRequest ?? false,
    })
    .where('id', '=', m.id)
    .where('body', 'is', null)
    .where('deleted_at', 'is', null)
    .returning(MESSAGE_COLUMNS)
    .executeTakeFirst();
  if (!updated) return;
  // One view, as its sender sees it, to everyone (M16 D2a): each device works out its own parts
  // of a message.updated (its reactions, its votes), and the bus masks a customer's copy. Before,
  // a group's voice note built the view once a member.
  const members = (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id);
  const [view] = await messageViews(ctx.db, [updated], m.sender_id);
  if (view)
    await ctx.bus.publish(members, {
      type: 'message.updated',
      data: { ...view, clientId: null },
    });
  // What it asks, promises or decides, offered once as a text's would be.
  await heard(ctx, updated, read.analysis);
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

export function registerTranscribeJob(heard: HeardWords): void {
  registerJob(TRANSCRIBE_JOB, (ctx, payload) => transcribe(ctx, payload, heard));
}
