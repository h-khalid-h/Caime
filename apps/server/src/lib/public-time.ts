/**
 * Another time for a booking made before an account, answered from the mail (M16 F5c, R97 (1)):
 * the host's page, opened from the mail's link (`?time=<claim>`), says what was asked and takes
 * a yes or a no as a form, the shape of every visitor's step (a page state, a form, a redirect, a
 * sealed claim). The answer is the booker's own move of their card (`moveCard`, as the booker,
 * only at the time the claim asked about), so the team is told, the calendar follows and the
 * booker's mail says so, as for any move. What the page says is read from the card each time.
 */
import { askedBy } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import { assertCanWrite } from './blocks';
import { bookingOf } from './booking';
import { openTimeClaim, type TimeClaim } from './booking-time-claim';
import { customerMask } from './business';
import { membership } from './conversation-views';
import { AppError } from './errors';
import { mayMove, moveCard } from './kit-moves';

type Card = {
  kit?: string;
  state?: string;
  title?: string;
  sequence?: number;
  proposedBy?: string;
  fields?: { title?: string; start?: { at?: string } };
  booking?: { name?: string; hostId?: string };
  history?: Array<{ state: string; by: string }>;
};

/** Whose page the claim's card is shown on: the organization's, or the person's from their catalog. */
export type TimeHost = { kind: 'org' | 'person'; id: string };

/** What the host's page shows of another time asked by mail. */
export type VisitorTimeState =
  | {
      step: 'ask';
      claim: string;
      what: string;
      at: string;
      was: string | null;
      timeZone: string;
      error: 'too_many' | null;
    }
  | { step: 'accepted'; what: string; at: string; timeZone: string }
  | { step: 'off'; what: string; byYou: boolean }
  /** Answered already at another time, or another time asked since: the latest mail has it. */
  | { step: 'changed' }
  | { step: 'expired' };

const what = (p: Card) =>
  String(p.booking?.name || p.fields?.title || p.title || tr('Your booking')).slice(0, 120);

/** The card a claim names, and whose page it's on, or null when it's gone. */
async function cardOf(
  ctx: AppContext,
  claim: TimeClaim,
): Promise<{ m: Message; host: TimeHost; timeZone: string; page: string } | null> {
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', claim.messageId)
    .executeTakeFirst();
  const p = (m?.payload ?? {}) as Card;
  if (!m || m.deleted_at || m.kind !== 'kit' || p.kit !== 'appointment') return null;
  if (m.sender_id !== claim.personId) return null;
  const business = await customerMask(ctx.db, m.conversation_id);
  if (business) {
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['id', 'handle', 'booking', 'time_zone'])
      .where('id', '=', business.orgId)
      .executeTakeFirst();
    if (!org) return null;
    return {
      m,
      host: { kind: 'org', id: org.id },
      timeZone: bookingOf(org)?.timeZone || org.time_zone || 'UTC',
      page: `/o/${encodeURIComponent(org.handle)}`,
    };
  }
  if (!p.booking?.hostId) return null;
  const person = await ctx.db
    .selectFrom('users')
    .select(['id', 'handle', 'booking', 'time_zone'])
    .where('id', '=', p.booking.hostId)
    .executeTakeFirst();
  if (!person) return null;
  return {
    m,
    host: { kind: 'person', id: person.id },
    timeZone: bookingOf(person)?.timeZone || person.time_zone || 'UTC',
    page: `/@${encodeURIComponent(person.handle)}`,
  };
}

/** Whether the card still asks the booker about the time the claim names. */
function stillAsks(m: Message, claim: TimeClaim): boolean {
  const p = (m.payload ?? {}) as Card;
  return (
    p.state === 'requested' &&
    (p.sequence ?? 0) === claim.sequence &&
    askedBy(p, m.sender_id) !== claim.personId
  );
}

/**
 * The step a host's page shows for `?time=` (and `?time-error=`), or null without one, or for a
 * claim whose card isn't this host's (it says nothing on another page).
 */
export async function visitorTimeState(
  ctx: AppContext,
  host: TimeHost,
  search: URLSearchParams,
): Promise<VisitorTimeState | null> {
  const token = search.get('time');
  if (!token) return null;
  const opened = await openTimeClaim(ctx, token);
  if (!opened) return { step: 'expired' };
  const found = await cardOf(ctx, opened.claim);
  if (!found) return { step: 'changed' };
  if (found.host.kind !== host.kind || found.host.id !== host.id) return null;
  const { m, timeZone } = found;
  const { claim } = opened;
  const p = (m.payload ?? {}) as Card;
  const at = p.fields?.start?.at ?? '';
  if ((p.sequence ?? 0) !== claim.sequence) return { step: 'changed' };
  if (p.state === 'confirmed') return { step: 'accepted', what: what(p), at, timeZone };
  if (p.state === 'cancelled')
    return { step: 'off', what: what(p), byYou: p.history?.at(-1)?.by === claim.personId };
  if (!stillAsks(m, claim)) return { step: 'changed' };
  if (opened.expired) return { step: 'expired' };
  return {
    step: 'ask',
    claim: token,
    what: what(p),
    at,
    was: claim.was,
    timeZone,
    error: search.get('time-error') === 'too_many' ? 'too_many' : null,
  };
}

/** The host's page a claim's card is shown on, or null when it's gone or the claim isn't ours. */
export async function timePage(ctx: AppContext, token: string): Promise<string | null> {
  const opened = await openTimeClaim(ctx, token);
  return opened ? ((await cardOf(ctx, opened.claim))?.page ?? null) : null;
}

/**
 * The booker's yes or no, as their own move of the card at the time it asked (`moveCard` with its
 * sequence, under its lock), then the page to go back to; `changed` where it no longer asks them
 * (answered, another time since, their card gone, the conversation closed to them).
 */
export async function answerVisitorTime(
  ctx: AppContext,
  token: string,
  yes: boolean,
): Promise<{ page: string | null; outcome: 'accepted' | 'declined' | 'changed' }> {
  const opened = await openTimeClaim(ctx, token);
  if (!opened) return { page: null, outcome: 'changed' };
  const found = await cardOf(ctx, opened.claim);
  if (!found) return { page: null, outcome: 'changed' };
  const { m, page } = found;
  const { claim } = opened;
  if (opened.expired || !stillAsks(m, claim)) return { page, outcome: 'changed' };
  const to = yes ? 'confirmed' : 'cancelled';
  try {
    await membership(ctx, claim.personId, m.conversation_id);
    await assertCanWrite(ctx, m.conversation_id, claim.personId);
  } catch (err) {
    if (err instanceof AppError && err.status < 500) return { page, outcome: 'changed' };
    throw err;
  }
  const business = await customerMask(ctx.db, m.conversation_id);
  if (!mayMove(m, to, claim.personId, business)) return { page, outcome: 'changed' };
  const moved = await moveCard(ctx, m, {
    to,
    actorId: claim.personId,
    business,
    sequence: claim.sequence,
  });
  if (moved === 'conflict') return { page, outcome: 'changed' };
  return { page, outcome: yes ? 'accepted' : 'declined' };
}
