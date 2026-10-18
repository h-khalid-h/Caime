/**
 * Keeping a meeting (M16 C3f, review 2026-10-17 §1 M: the guest page offered only Sign out): a
 * meeting's guest makes it their Caime account, and the meeting, its people and what was said
 * there stay theirs, because the account is the guest they were (the same row).
 *
 * A guest invited by address keeps it as anyone claims an address: signing up with it, proven by
 * the code sent there (review §2 H1), since that address may hold more than the meeting. A guest
 * by link has no address and nothing behind them but the meeting, so their own page is handed a
 * sealed claim naming them, good for half an hour, which sign-up takes in place of a code.
 */
import type { GuestKeepResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import { badRequest, forbidden } from './errors';
import { isLinkGuestAddress } from './provisional';
import { serverKey } from './server-keys';
import { seal, unseal } from './vault';

/** How long a guest's page has to finish signing up with its claim. */
export const KEEP_MINUTES = 30;
const LABEL = 'caime guest keep v1';
const keepKey = (ctx: AppContext) => serverKey(ctx, 'guest.keep');

interface KeepClaim {
  v: 1;
  /** The guest, a provisional person at no one's address. */
  u: string;
  /** When it runs out, in milliseconds. */
  e: number;
}

/** A claim run out, changed, or spent already (the guest is a person now). */
export const keepRanOut = () =>
  badRequest(
    tr('This way to keep the meeting has run out. Open your link again, and keep it from there.'),
  );

/** What a guest's page needs to send them to sign-up: their name, and their address or a claim. */
export async function keepFor(ctx: AppContext, userId: string): Promise<GuestKeepResponse> {
  const me = await ctx.db
    .selectFrom('users')
    .select(['kind', 'email', 'display_name'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  if (me.kind !== 'provisional') throw forbidden(tr('Only a meeting’s guest keeps it this way.'));
  if (!isLinkGuestAddress(me.email)) return { name: me.display_name, email: me.email, claim: null };
  const claim: KeepClaim = { v: 1, u: userId, e: ctx.now().getTime() + KEEP_MINUTES * 60_000 };
  return {
    name: me.display_name,
    email: null,
    claim: seal(await keepKey(ctx), Buffer.from(JSON.stringify(claim)), LABEL).toString(
      'base64url',
    ),
  };
}

/**
 * The guest a claim names, while it's good and they're still a guest by link; null for anything
 * changed, run out, not ours or already kept.
 */
export async function keptGuest(ctx: AppContext, token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(token)) return null;
  const plain = unseal(await keepKey(ctx), Buffer.from(token, 'base64url'), LABEL);
  if (!plain) return null;
  let claim: KeepClaim;
  try {
    claim = JSON.parse(plain.toString()) as KeepClaim;
  } catch {
    return null;
  }
  if (claim.v !== 1 || typeof claim.u !== 'string' || typeof claim.e !== 'number') return null;
  if (claim.e <= ctx.now().getTime()) return null;
  const guest = await ctx.db
    .selectFrom('users')
    .select(['kind', 'email'])
    .where('id', '=', claim.u)
    .executeTakeFirst();
  return guest?.kind === 'provisional' && isLinkGuestAddress(guest.email) ? claim.u : null;
}
