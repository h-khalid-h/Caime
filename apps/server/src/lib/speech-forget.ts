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

/** Queues the delete of what the provider kept, once, whoever read it. */
export async function forgetLater(ctx: AppContext, ref: string | null): Promise<void> {
  if (!ref || !ctx.speech) return;
  await enqueue(ctx, FORGET_JOB, { ref }, { dedupeKey: `${FORGET_JOB}:${ref}` });
}

export function registerSpeechForgetJob(): void {
  registerJob(FORGET_JOB, async (ctx, payload) => {
    const ref = typeof payload.ref === 'string' ? payload.ref : '';
    if (!ref || !ctx.speech) return;
    try {
      await ctx.speech.forget(ref);
    } catch (err) {
      ctx.metrics.speechForgotten.inc({ outcome: 'failed' });
      throw err;
    }
    ctx.metrics.speechForgotten.inc({ outcome: 'deleted' });
  });
}
