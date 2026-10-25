/**
 * The parts of a call's recording still being sent when Cai stops (M17 I13b): each is finished a
 * minute on, once the piece that was on its way has landed (`lib/call-recording.ts`). Apart from
 * the recording so the notes' rules (`lib/call-notes.ts`) can call it without importing it.
 */
import type { AppContext } from '../context';
import { enqueue } from './jobs';

export const RECORDING_FINISH_JOB = 'call.recording.finish';
/** How long a piece already on its way when Cai stops may still land (R85 (2)). */
export const LATE_MS = 60_000;

/** Every part of the call still being recorded is finished once a late piece could have landed. */
export async function finishOpenParts(ctx: AppContext, callId: string): Promise<void> {
  const open = await ctx.db
    .selectFrom('call_recording_parts')
    .select('id')
    .where('call_id', '=', callId)
    .where('state', '=', 'recording')
    .execute();
  const runAt = new Date(ctx.now().getTime() + LATE_MS + 5_000);
  for (const part of open)
    await enqueue(
      ctx,
      RECORDING_FINISH_JOB,
      { partId: part.id, late: true },
      { runAt, dedupeKey: `${RECORDING_FINISH_JOB}:late:${part.id}`, maxAttempts: 3 },
    );
}
