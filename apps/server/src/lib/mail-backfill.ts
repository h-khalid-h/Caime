/**
 * Mail received before signatures were set apart (R75): each sender's mail is compared with
 * their other mail, and the closing lines they share (core `sharedTail`) are folded into
 * `mail_messages.signature`, out of the words. Run once, whichever instance, then marked done.
 */
import { mailText, sharedTail, signatureWithoutMarks } from '@caime/core/mail-text';
import type { AppContext } from '../context';
import { enqueue, registerJob } from './jobs';

const JOB = 'mail.signatures';
const DONE = 'mail.signatures.backfilled';
/** At most this many mails in a pass: the backfill is for mail from before, a bounded set. */
const LIMIT = 5000;

/** One pass over mail in without a signature (exported for its test). */
export async function backfillMailSignatures(ctx: AppContext): Promise<void> {
  const done = await ctx.db
    .selectFrom('server_settings')
    .select('key')
    .where('key', '=', DONE)
    .executeTakeFirst();
  if (done) return;
  const rows = await ctx.db
    .selectFrom('mail_messages as mm')
    .innerJoin('messages as m', 'm.id', 'mm.message_id')
    .select(['mm.message_id', 'mm.from_address', 'm.body'])
    .where('mm.direction', '=', 'in')
    .where('mm.signature', 'is', null)
    .where('m.deleted_at', 'is', null)
    .where('m.body', 'is not', null)
    .orderBy('mm.from_address')
    .orderBy('m.created_at')
    .limit(LIMIT)
    .execute();
  const bySender = new Map<string, Array<{ id: string; body: string }>>();
  for (const r of rows)
    bySender.set(r.from_address, [
      ...(bySender.get(r.from_address) ?? []),
      { id: r.message_id, body: r.body ?? '' },
    ]);
  let folded = 0;
  for (const mails of bySender.values()) {
    if (mails.length < 2) continue;
    for (const [i, mail] of mails.entries()) {
      // The signature this mail shares with the sender's next mail, else their previous one.
      const other = mails[i + 1] ?? mails[i - 1];
      const tail = other ? sharedTail(mail.body, other.body) : null;
      if (!tail) continue;
      const words = mailText(mail.body, null, tail);
      if (!words.signature) continue;
      await ctx.db.transaction().execute(async (trx) => {
        await trx
          .updateTable('messages')
          .set({ body: words.body })
          .where('id', '=', mail.id)
          .execute();
        await trx
          .updateTable('mail_messages')
          .set({ signature: signatureWithoutMarks(words.signature ?? '').slice(0, 2000) })
          .where('message_id', '=', mail.id)
          .execute();
      });
      folded++;
    }
  }
  await ctx.db
    .insertInto('server_settings')
    .values({ key: DONE, value: JSON.stringify({ at: ctx.now().toISOString(), folded }) })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute();
  ctx.log.info({ folded }, 'mail signatures backfilled');
}

export function registerMailBackfill(): void {
  registerJob(JOB, backfillMailSignatures);
}

/** At start: queued once, whichever instance, until it has run. */
export async function startMailBackfill(ctx: AppContext): Promise<void> {
  const done = await ctx.db
    .selectFrom('server_settings')
    .select('key')
    .where('key', '=', DONE)
    .executeTakeFirst();
  if (!done) await enqueue(ctx, JOB, {}, { dedupeKey: 'mail-signatures-v1' });
}
