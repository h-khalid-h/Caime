/**
 * Cai answering aloud in its chat (M17 I14a): when someone spoke to Cai or a Caime Friend, a short
 * answer comes back as its voice note, the words under it as what it said. The words go through
 * the one voice path (`ctx.tts`, `runAi('speak')` on the person's allowance, what the provider
 * kept forgotten by `forgetLater`), the sound is kept as a file of Cai's own (counted on nobody's
 * storage) and its length read from its bytes. Nothing is spoken that's long enough to be better
 * read (a list), for anyone under 18 or without AI assist, or without a voice configured: then the
 * answer is written, as before.
 */
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { AiError } from './ai';
import { runAi } from './ai-run';
import { audioLengthMs } from './audio-length';
import { AppError } from './errors';
import { dropUnusedFiles, removeStored, storeBytes } from './files';
import { registerPeriodic } from './jobs';
import { assertAiAllowance } from './plans';
import { postAs } from './post-as';
import { forgetLater } from './speech-forget';
import { storageFor } from './storage';

/** An answer longer than this is read, not heard. */
export const SPOKEN_REPLY_MAX = 400;
/** A spoken answer's sound is kept this long; then the answer stays as its words. */
export const SPOKEN_KEPT_DAYS = 30;
const DAY_MS = 86_400_000;
const SWEEP_BATCH = 200;

/** A written line as it's said: a list's bullets and breaks become pauses. */
export function spokenText(text: string): string {
  return text
    .replace(/^•\s*/gm, '')
    .replace(/:\s*\n/g, ': ')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s·\s/g, ', ')
    .trim();
}

/**
 * Says `text` in `conversationId` as `accountId`'s voice note, paid from `personId`'s allowance;
 * false when it wasn't (too long, no voice, out of allowance, the provider away), for the caller
 * to write it instead.
 */
export async function speakReply(
  ctx: AppContext,
  accountId: string,
  conversationId: string,
  personId: string,
  text: string,
  language: string,
): Promise<boolean> {
  const tts = ctx.tts;
  const words = text.trim();
  if (!tts || !words || words.length > SPOKEN_REPLY_MAX) return false;
  try {
    await assertAiAllowance(ctx, personId);
  } catch (err) {
    if (err instanceof AppError) return false;
    throw err;
  }
  let sound: Awaited<ReturnType<typeof tts.speak>>['value'];
  try {
    sound = await runAi(
      ctx,
      'speak',
      personId,
      () => tts.speak({ text: spokenText(words), language }),
      tts.provider,
    );
  } catch (err) {
    if (err instanceof AppError || err instanceof AiError) {
      ctx.metrics.caiVoice.inc({ outcome: 'written' });
      return false;
    }
    throw err;
  }
  await forgetLater(ctx, sound.ref, 'tts');
  const file = await storeBytes(ctx, storageFor(ctx.config), {
    ownerId: accountId,
    bytes: sound.bytes,
    mime: sound.mime,
    name: 'Cai',
  });
  // Its length as it plays, read from the bytes by the kind they are (M16 G12).
  const durationMs = audioLengthMs(sound.bytes, file.mime);
  let messageId: string;
  try {
    const { message } = await postAs(
      ctx,
      accountId,
      conversationId,
      {
        kind: 'voice',
        body: words,
        fileIds: [file.id],
        // Caime's own mark: these are Cai's words, said, never a transcript of anyone's.
        payload: { spoken: true, ...(durationMs ? { durationMs } : {}) },
      },
      { serverPayload: true },
    );
    messageId = message.id;
  } catch (err) {
    // Not sent (blocked meanwhile, the conversation gone): the sound goes with it.
    const gone = await dropUnusedFiles(ctx.db, [file.id]);
    await removeStored(ctx, storageFor(ctx.config), gone, 'spoken answer not sent');
    throw err;
  }
  await ctx.db
    .insertInto('cai_spoken')
    .values({ file_id: file.id, message_id: messageId, created_at: ctx.now() })
    .execute();
  ctx.metrics.caiVoice.inc({ outcome: 'spoken' });
  return true;
}

/**
 * Daily: a spoken answer's sound past `SPOKEN_KEPT_DAYS` goes, and the answer stays as its words
 * (a text of Cai's); a sound whose message went any other way goes at once. The bytes are Cai's,
 * counted on nobody's storage, so nothing keeps them past their use.
 */
export async function letGoOfSpoken(ctx: AppContext): Promise<void> {
  const before = new Date(ctx.now().getTime() - SPOKEN_KEPT_DAYS * DAY_MS);
  const storage = storageFor(ctx.config);
  for (;;) {
    const due = await ctx.db
      .selectFrom('cai_spoken')
      .select(['file_id', 'message_id'])
      .where((eb) => eb.or([eb('message_id', 'is', null), eb('created_at', '<', before)]))
      .limit(SWEEP_BATCH)
      .execute();
    if (!due.length) break;
    const files = due.map((d) => d.file_id);
    const messages = due.map((d) => d.message_id).filter((m): m is string => m !== null);
    const gone = await ctx.db.transaction().execute(async (trx) => {
      if (messages.length) {
        await trx
          .updateTable('messages')
          .set({ kind: 'text', payload: sql`payload - 'spoken' - 'durationMs'` })
          .where('id', 'in', messages)
          .where('kind', '=', 'voice')
          .execute();
        await trx
          .deleteFrom('message_files')
          .where('message_id', 'in', messages)
          .where('file_id', 'in', files)
          .execute();
        // Nor is it a file of the conversation's any more (M16 H6).
        await trx
          .deleteFrom('assets')
          .where('message_id', 'in', messages)
          .where('file_id', 'in', files)
          .execute();
      }
      // A sound forwarded on stays for whoever has it; this row goes either way.
      await trx.deleteFrom('cai_spoken').where('file_id', 'in', files).execute();
      return dropUnusedFiles(trx, files);
    });
    await removeStored(ctx, storage, gone, 'spoken answer let go');
    ctx.metrics.caiVoice.inc({ outcome: 'let_go' }, due.length);
    if (due.length < SWEEP_BATCH) break;
  }
}

export function registerSpokenSweep(): void {
  registerPeriodic({
    name: 'cai.spoken',
    everyMs: DAY_MS,
    background: true,
    run: letGoOfSpoken,
  });
}
