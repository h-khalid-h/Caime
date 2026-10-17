/**
 * Six digits to an address, to prove it's the person's (R48): kept hashed in `email_codes` under
 * the person's id, a day, ten tries counted in the database, a new one in place of the last.
 * Sign-up's confirmation and booking before an account (R97, block C) both prove an address this
 * way, so the rules live here once. The mail itself goes after the response (`ctx.defer`), never
 * through the job queue.
 */
import { randomInt, timingSafeEqual } from 'node:crypto';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import { hashToken } from './crypto';
import { verificationMail } from './email';
import { AppError } from './errors';

export const CODE_LIFE_MS = 24 * 3_600_000;
export const CODE_TRIES = 10;

/** Sends a fresh code to the address for the person (nothing without a mailer). */
export async function sendEmailCode(
  ctx: AppContext,
  userId: string,
  email: string,
  name: string,
): Promise<void> {
  if (!ctx.mail) return;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(ctx.now().getTime() + CODE_LIFE_MS);
  await ctx.db
    .insertInto('email_codes')
    .values({ user_id: userId, code_hash: hashToken(code), attempts: 0, expires_at: expiresAt })
    .onConflict((oc) =>
      oc
        .column('user_id')
        .doUpdateSet({ code_hash: hashToken(code), attempts: 0, expires_at: expiresAt }),
    )
    .execute();
  const mail = ctx.mail;
  ctx.defer('email.code', () => mail.send(verificationMail(email, name, code)));
}

/**
 * Checks the code the person typed against the one sent, and spends it: a wrong one counts a
 * try (in the database, so parallel guesses each count), a run-out or over-tried one asks for a
 * new one, and a right one is deleted so it opens nothing twice.
 */
export async function spendEmailCode(ctx: AppContext, userId: string, code: string): Promise<void> {
  const wrong = () =>
    new AppError(400, 'wrong_code', tr('That code isn’t right. Check the email again.'));
  const row = await ctx.db
    .selectFrom('email_codes')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!row || row.expires_at <= ctx.now())
    throw new AppError(400, 'code_expired', tr('That code has run out. Send a new one.'));
  if (row.attempts >= CODE_TRIES)
    throw new AppError(400, 'code_expired', tr('Too many tries with that code. Send a new one.'));
  if (!timingSafeEqual(row.code_hash, hashToken(code))) {
    await ctx.db
      .updateTable('email_codes')
      .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
      .where('user_id', '=', userId)
      .execute();
    throw wrong();
  }
  await ctx.db.deleteFrom('email_codes').where('user_id', '=', userId).execute();
}
