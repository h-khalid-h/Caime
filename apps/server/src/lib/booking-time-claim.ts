/**
 * Another time for a booking made before an account, answered from the mail itself (M16 F5c,
 * R97 (1)): the mail carries a link to the host's own page with this claim, sealed, which names
 * the card, the booker and the time asked (its `sequence`), and runs out when that time starts.
 * Nothing is kept for it: the card says, each time it's read, whether it still asks.
 */
import type { AppContext } from '../context';
import { serverKey } from './server-keys';
import { seal, unseal } from './vault';

const LABEL = 'caime public time v1';
const claimKey = (ctx: Pick<AppContext, 'db'>) => serverKey(ctx, 'public.time');

/** The time a host asked a booker about, sealed into the link; `e` is when it runs out (ms). */
export interface TimeClaim {
  v: 1;
  messageId: string;
  /** The booker: the provisional person whose own card it is. */
  personId: string;
  /** The card's invitations' count when it asked (M16 F5): another time since is another ask. */
  sequence: number;
  /** The time it had before, for the page to say what changed. */
  was: string | null;
  e: number;
}

export async function sealTimeClaim(ctx: AppContext, claim: TimeClaim): Promise<string> {
  return seal(await claimKey(ctx), Buffer.from(JSON.stringify(claim)), LABEL).toString('base64url');
}

/**
 * The claim a link carries, run out or not (`expired` says which), or null for anything changed
 * or not ours: a page says a link ran out, and a form posted from one still finds its page.
 */
export async function openTimeClaim(
  ctx: AppContext,
  token: string,
): Promise<{ claim: TimeClaim; expired: boolean } | null> {
  if (!/^[A-Za-z0-9_-]{32,2048}$/.test(token)) return null;
  const plain = unseal(await claimKey(ctx), Buffer.from(token, 'base64url'), LABEL);
  if (!plain) return null;
  try {
    const claim = JSON.parse(plain.toString()) as TimeClaim;
    if (claim.v !== 1 || typeof claim.e !== 'number' || typeof claim.messageId !== 'string')
      return null;
    return { claim, expired: claim.e <= ctx.now().getTime() };
  } catch {
    return null;
  }
}
