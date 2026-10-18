/**
 * A suspended account (R49, M16 B6: the DSA's statement of reasons and internal complaint
 * handling, Art. 17 and 20, and GDPR Art. 20's copy of one's data): every way in still refuses it,
 * now with the operator's reason and, to whoever has just proven the password or the passkey, a
 * claim (`serverKey('suspension.claim')`, thirty minutes) that opens two things and nothing else:
 * an appeal (one open at a time, decided on `/admin/reports` by lifting the suspension or
 * upholding it, the person mailed either way) and a copy of their data (the export's own JSON).
 * No session is made: a suspended account is never signed in.
 */
import { uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import { audit } from './audit';
import { AppError } from './errors';
import { serverKey } from './server-keys';
import { seal, unseal } from './vault';

export const SUSPENSION_CLAIM_MS = 30 * 60_000;
const LABEL = 'caime suspension claim v1';

interface Claim {
  u: string;
  e: number;
}

const claimKey = (ctx: AppContext) => serverKey(ctx, 'suspension.claim');

/** The refusal every way in answers a suspended account with; a claim only after a proof. */
export async function suspendedRefusal(
  ctx: AppContext,
  user: { id: string; suspended_reason: string | null },
  proven: boolean,
): Promise<AppError> {
  const claim = proven
    ? seal(
        await claimKey(ctx),
        Buffer.from(JSON.stringify({ u: user.id, e: ctx.now().getTime() + SUSPENSION_CLAIM_MS })),
        LABEL,
      ).toString('base64url')
    : null;
  return new AppError(
    403,
    'suspended',
    tr('This account is suspended. You can appeal, and download your data.'),
    { reason: user.suspended_reason, claim },
  );
}

/** Whose claim it is, while it's fresh and the account is still suspended; else null. */
export async function openSuspensionClaim(
  ctx: AppContext,
  raw: string,
): Promise<{ userId: string; email: string | null; name: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,2048}$/.test(raw)) return null;
  const plain = unseal(await claimKey(ctx), Buffer.from(raw, 'base64url'), LABEL);
  if (!plain) return null;
  let c: Claim;
  try {
    c = JSON.parse(plain.toString()) as Claim;
  } catch {
    return null;
  }
  if (typeof c.u !== 'string' || typeof c.e !== 'number' || c.e <= ctx.now().getTime()) return null;
  const user = await ctx.db
    .selectFrom('users')
    .select(['id', 'email', 'display_name', 'suspended_at', 'deleted_at'])
    .where('id', '=', c.u)
    .executeTakeFirst();
  if (!user || user.deleted_at || !user.suspended_at) return null;
  return { userId: user.id, email: user.email, name: user.display_name };
}

/** An appeal, one open at a time: false when one is already waiting. */
export async function appeal(ctx: AppContext, userId: string, text: string): Promise<boolean> {
  const made = await ctx.db
    .insertInto('appeals')
    .values({ id: uuidv7(), user_id: userId, body: text, created_at: ctx.now() })
    .onConflict((oc) => oc.column('user_id').where('decided_at', 'is', null).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!made) return false;
  await audit(ctx.db, { actorId: userId, action: 'moderation.appealed', target: userId });
  ctx.metrics.appeals.inc({ outcome: 'made' });
  return true;
}
