/**
 * A password reset link (R48): a random token kept only as a hash, good for an hour, mailed to
 * the account's own address after the response. Asked for by the person at the sign-in screen
 * (`POST /auth/reset`) or sent by the operator for someone locked out
 * (`POST /admin/people/:handle/reset`): the same link, never to any other address.
 */
import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@caime/core';
import type { AppContext } from '../context';
import { hashToken } from './crypto';
import { type Mailer, resetMail } from './email';

export const RESET_LIFE_MS = 3_600_000;

export async function sendResetLink(
  ctx: AppContext,
  mail: Mailer,
  user: { id: string; email: string; display_name: string },
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await ctx.db
    .insertInto('password_resets')
    .values({
      id: uuidv7(),
      user_id: user.id,
      token_hash: hashToken(token),
      expires_at: new Date(ctx.now().getTime() + RESET_LIFE_MS),
    })
    .execute();
  const link = `${ctx.config.PUBLIC_URL.replace(/\/+$/, '')}/reset?token=${token}`;
  ctx.defer('email.reset', () => mail.send(resetMail(user.email, user.display_name, link)));
}
