/**
 * What the speech provider kept of a transcript, deleted once its words are Caime's (M17 F8a,
 * R85 (6)): ElevenLabs keeps each transcript in the account's history by default, and only an
 * enterprise contract turns that off, so every one Caime reads is deleted by its id. A job of its
 * own, so a provider that's away is asked again and never holds up the words; its payload is the
 * provider's id alone.
 */
import type { AppContext } from '../context';
import { enqueue, registerJob } from './jobs';

export const FORGET_JOB = 'speech.forget';

/**
 * Queues the delete of what the provider kept, once, whoever read it: the speech-to-text
 * provider's transcript, or (M17 I13g) the voice provider's record of what Cai said.
 */
export async function forgetLater(
  ctx: AppContext,
  ref: string | null,
  by: 'speech' | 'tts' = 'speech',
): Promise<void> {
  if (!ref || !(by === 'tts' ? ctx.tts : ctx.speech)) return;
  await enqueue(ctx, FORGET_JOB, { ref, by }, { dedupeKey: `${FORGET_JOB}:${by}:${ref}` });
}

export function registerSpeechForgetJob(): void {
  registerJob(FORGET_JOB, async (ctx, payload) => {
    const ref = typeof payload.ref === 'string' ? payload.ref : '';
    const provider = payload.by === 'tts' ? ctx.tts : ctx.speech;
    if (!ref || !provider) return;
    try {
      await provider.forget(ref);
    } catch (err) {
      ctx.metrics.speechForgotten.inc({ outcome: 'failed' });
      throw err;
    }
    ctx.metrics.speechForgotten.inc({ outcome: 'deleted' });
  });
}
