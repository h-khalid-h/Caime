/**
 * Booking before an account (R97 (1), block C): a visitor on an item's page picks one of the
 * week's open times, gives a name and an address, proves the address with a six-digit code, and
 * the booking lands as an appointment request from their provisional self (R93: one address is
 * one person; signing up with it later claims it all). The item is an organization's (the
 * request opens its customer conversation) or a person's (C1c: their one-to-one, as a message
 * request whose booking holds the time while it waits). Nothing of theirs is kept before the code
 * comes back: what they chose rides between the two steps as a sealed claim in the page's
 * address, fifteen minutes long, bound to this purpose.
 */
import { addressValue } from '@caime/core/addresses';
import type { BookingItem } from '@caime/core/booking';
import { isBooked } from '@caime/core/booking';
import { zonedParts } from '@caime/core/time';
import type { AppContext } from '../context';
import type { Organization, User } from '../db/schema';
import { type BookingHost, itemsFor, openSlotsFor, orgHost, personHost } from './booking';
import { startCustomerConversation } from './business-threads';
import { ensureDirectConversation } from './conversations';
import { sendEmailCode, spendEmailCode } from './email-codes';
import { AppError } from './errors';
import { afterMessage } from './message-effects';
import { sendMessage } from './messages';
import { personForAddress } from './provisional';
import { isBlockedEitherWay } from './relations';
import { serverKey } from './server-keys';
import { minorOf, privacyOf } from './users';
import { seal, unseal } from './vault';

/** How many days the page shows, and how many times a day: the rest is in the conversation. */
export const SLOT_DAYS = 7;
export const SLOTS_A_DAY = 16;
/** How long the choice waits for its code. */
export const CLAIM_MS = 15 * 60_000;
/** Codes to one address an hour, and bookings started from one address an hour. */
export const CODES_AN_HOUR = 3;
export const STARTS_AN_HOUR = 30;

const LABEL = 'caime public booking v1';
const claimKey = (ctx: AppContext) => serverKey(ctx, 'public.book');

/** Whose catalog a visitor books from: an organization's, or a person's (C1c). */
export type VisitorHost = { kind: 'org'; row: Organization } | { kind: 'person'; row: User };

function hostOf(host: VisitorHost): BookingHost {
  return host.kind === 'org' ? orgHost(host.row) : personHost(host.row);
}

/**
 * Whom a visitor may book: an open organization (the handle's lookup has seen to that), or a
 * person on Caime who is an adult (R29: no stranger books a minor; their page shows nothing
 * either) and takes message requests from anyone, since the booking is one (a stranger on Caime
 * meets the same rule, `assertCanMessage`).
 */
export function visitorMayBook(host: VisitorHost, now: Date): boolean {
  if (host.kind === 'org') return true;
  const u = host.row;
  return (
    u.kind === 'human' &&
    !u.deleted_at &&
    !u.suspended_at &&
    !minorOf(u, now) &&
    privacyOf(u, now).messageRequests === 'everyone'
  );
}

/**
 * What a visitor chose, sealed between the two steps; `e` is when it runs out (ms). Version 2
 * names the host's kind (an organization's claims were version 1, fifteen minutes long, and read
 * as run out).
 */
export interface BookingClaim {
  v: 2;
  hostKind: 'org' | 'person';
  hostId: string;
  itemId: string;
  at: string;
  personId: string;
  name: string;
  email: string;
  e: number;
}

/** A visitor's view of the open times: by the host's day, in its zone, a week from `from`. */
export interface PublicSlots {
  timeZone: string;
  /** The first day shown (`YYYY-MM-DD` in the host's zone). */
  from: string;
  days: Array<{ day: string; times: string[] }>;
  /** The first day of the week after, while the horizon reaches it; the week before, past today. */
  next: string | null;
  previous: string | null;
}

/** The public booker: anyone, adult until the form says otherwise (the booking asks again). */
export const VISITOR = { isConnected: false, spheres: [] as const, adult: true };

/** The day a time falls on, in a zone. */
function dayOf(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Midnight UTC of a `YYYY-MM-DD`, or null for anything else. */
function dayStart(day: string | null | undefined): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shiftDay(day: string, days: number): string {
  const d = dayStart(day) ?? new Date(0);
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The week's open times for one public item, for the item's page. `from` is a day the visitor
 * asked for, else today; the window never starts before today or reaches past the horizon.
 */
export async function publicSlotsFor(
  ctx: AppContext,
  visitorHost: VisitorHost,
  item: BookingItem,
  from?: string | null,
): Promise<PublicSlots | null> {
  const host = hostOf(visitorHost);
  if (!host.hours || !isBooked(item)) return null;
  if (!itemsFor(host, VISITOR).some((i) => i.id === item.id)) return null;
  const timeZone = host.hours.timeZone;
  const today = dayOf(ctx.now(), timeZone);
  const asked = dayStart(from) ? (from as string) : today;
  const start = asked < today ? today : asked;
  const horizon = shiftDay(today, host.hours.horizonDays);
  if (start > horizon) return null;
  const end = shiftDay(start, SLOT_DAYS);
  // The window in UTC, a day wide on each side, so a zone's day is whole whatever its offset.
  const window = {
    from: new Date((dayStart(start) as Date).getTime() - 86_400_000),
    to: new Date((dayStart(end) as Date).getTime() + 86_400_000),
  };
  const open = await openSlotsFor(ctx, host, window, { item, quantity: 1, fresh: false });
  if (!open) return null;
  const byDay = new Map<string, string[]>();
  for (const at of open.slots) {
    const day = dayOf(at, timeZone);
    if (day < start || day >= end) continue;
    const times = byDay.get(day) ?? [];
    if (times.length < SLOTS_A_DAY) times.push(at.toISOString());
    byDay.set(day, times);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    timeZone,
    from: start,
    days: days.map(([day, times]) => ({ day, times })),
    next: end <= horizon ? end : null,
    previous:
      start > today
        ? shiftDay(start, -SLOT_DAYS) < today
          ? today
          : shiftDay(start, -SLOT_DAYS)
        : null,
  };
}

export async function sealClaim(ctx: AppContext, claim: BookingClaim): Promise<string> {
  return seal(await claimKey(ctx), Buffer.from(JSON.stringify(claim)), LABEL).toString('base64url');
}

/** The claim a page or a form carries, or null for anything changed, run out or not ours. */
export async function openClaim(ctx: AppContext, token: string): Promise<BookingClaim | null> {
  if (!/^[A-Za-z0-9_-]{32,2048}$/.test(token)) return null;
  const plain = unseal(await claimKey(ctx), Buffer.from(token, 'base64url'), LABEL);
  if (!plain) return null;
  try {
    const claim = JSON.parse(plain.toString()) as BookingClaim;
    if (claim.v !== 2 || typeof claim.e !== 'number' || claim.e <= ctx.now().getTime()) return null;
    return claim;
  } catch {
    return null;
  }
}

/** Why a visitor's booking stopped, said on the page in its words. */
export type VisitorRefusal =
  | 'account'
  | 'no_mail'
  | 'not_bookable'
  | 'slot_taken'
  | 'expired'
  | 'wrong_code'
  | 'code_expired'
  | 'too_many'
  | 'adult'
  | 'waiting';

export type VisitorStart =
  | { kind: 'code'; claim: string }
  | { kind: 'refused'; reason: VisitorRefusal };

/**
 * Step one: the choice checked (the item is public and bookable, the time is one of the open
 * ones now), the address resolved to a person (someone's account is sent to sign in, never
 * mailed behind them), the code sent, the claim sealed.
 */
export async function startVisitorBooking(
  ctx: AppContext,
  visitorHost: VisitorHost,
  ask: { itemId: string; at: string; name: string; email: string },
): Promise<VisitorStart> {
  if (!visitorMayBook(visitorHost, ctx.now())) return { kind: 'refused', reason: 'not_bookable' };
  const host = hostOf(visitorHost);
  const item = host.hours ? itemsFor(host, VISITOR).find((i) => i.id === ask.itemId) : null;
  if (!item || !isBooked(item)) return { kind: 'refused', reason: 'not_bookable' };
  const at = new Date(ask.at);
  if (Number.isNaN(at.getTime())) return { kind: 'refused', reason: 'not_bookable' };
  // The day from that time: a slot is open when it is one of the day's, whole.
  const open = await openSlotsFor(
    ctx,
    host,
    { from: at, to: new Date(at.getTime() + 86_400_000) },
    { item, quantity: 1 },
  );
  if (!open?.slots.some((d) => d.getTime() === at.getTime()))
    return { kind: 'refused', reason: 'slot_taken' };
  const email = addressValue('email', ask.email);
  if (!email) return { kind: 'refused', reason: 'not_bookable' };
  if (!ctx.mail) return { kind: 'refused', reason: 'no_mail' };
  const name = ask.name.trim().slice(0, 80) || email;
  const person = await personForAddress(ctx, email, name);
  if (!person) return { kind: 'refused', reason: 'not_bookable' };
  if (person.kind !== 'provisional') return { kind: 'refused', reason: 'account' };
  // Their name as they wrote it this time (a provisional person has no other say).
  if (person.display_name !== name)
    await ctx.db
      .updateTable('users')
      .set({ display_name: name })
      .where('id', '=', person.id)
      .execute();
  await sendEmailCode(ctx, person.id, email, name, 'visitor');
  const claim: BookingClaim = {
    v: 2,
    hostKind: visitorHost.kind,
    hostId: visitorHost.row.id,
    itemId: item.id,
    at: at.toISOString(),
    personId: person.id,
    name,
    email,
    e: ctx.now().getTime() + CLAIM_MS,
  };
  return { kind: 'code', claim: await sealClaim(ctx, claim) };
}

export type VisitorBooked =
  | { kind: 'booked'; conversationId: string; messageId: string }
  | { kind: 'refused'; reason: VisitorRefusal };

/**
 * Step two: the code spent, the conversation started (or found: an organization's customer
 * conversation, or the one-to-one with a person as a message request), the appointment posted
 * as the provisional person with the catalog booking, exactly as anyone's own booking is
 * (`bookingFor` checks the time again under the host's lock), its effects run.
 */
export async function confirmVisitorBooking(
  ctx: AppContext,
  visitorHost: VisitorHost,
  claim: BookingClaim,
  code: string,
): Promise<VisitorBooked> {
  if (claim.hostKind !== visitorHost.kind || claim.hostId !== visitorHost.row.id)
    return { kind: 'refused', reason: 'expired' };
  try {
    await spendEmailCode(ctx, claim.personId, code);
  } catch (err) {
    if (err instanceof AppError && (err.code === 'wrong_code' || err.code === 'code_expired'))
      return { kind: 'refused', reason: err.code };
    throw err;
  }
  const person = await ctx.db
    .selectFrom('users')
    .select(['id', 'kind', 'birth_date', 'time_zone'])
    .where('id', '=', claim.personId)
    .executeTakeFirst();
  if (person?.kind !== 'provisional') return { kind: 'refused', reason: 'account' };
  const item = itemsFor(hostOf(visitorHost), VISITOR).find((i) => i.id === claim.itemId);
  if (!item || !visitorMayBook(visitorHost, ctx.now()))
    return { kind: 'refused', reason: 'not_bookable' };
  let conversationId: string;
  if (visitorHost.kind === 'org') {
    ({ conversationId } = await startCustomerConversation(ctx, person, visitorHost.row, null));
  } else {
    // A person blocked by the host (or blocking them) books nothing, and is told nothing more.
    if (await isBlockedEitherWay(ctx.db, visitorHost.row.id, person.id))
      return { kind: 'refused', reason: 'not_bookable' };
    ({ id: conversationId } = await ensureDirectConversation(
      ctx.db,
      person.id,
      visitorHost.row.id,
      { createdBy: person.id, requestFrom: person.id },
    ));
  }
  try {
    const sent = await sendMessage(ctx, person.id, conversationId, {
      // Twice is once: the claim stands for one booking.
      clientId: `public-book:${claim.personId}:${claim.at}:${claim.itemId}`,
      kind: 'kit',
      payload: {
        kit: 'appointment',
        fields: { title: item.name, start: { at: claim.at, hasTime: true } },
        booking: { itemId: item.id, quantity: 1 },
      },
    });
    if (sent.created) {
      const { message, analysis } = sent;
      ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
    }
    return { kind: 'booked', conversationId, messageId: sent.message.id };
  } catch (err) {
    if (err instanceof AppError && err.code === 'slot_taken')
      return { kind: 'refused', reason: 'slot_taken' };
    if (err instanceof AppError && err.code === 'not_bookable')
      return { kind: 'refused', reason: 'not_bookable' };
    // An earlier request to the person, still unanswered (R14: one message until they answer).
    if (err instanceof AppError && err.code === 'awaiting_acceptance')
      return { kind: 'refused', reason: 'waiting' };
    throw err;
  }
}

/** What the item's page shows of booking without an account: the step, from the address's query. */
export type VisitorBookingState =
  | { step: 'pick'; slots: PublicSlots; error: VisitorRefusal | null }
  | {
      step: 'code';
      claim: string;
      email: string;
      at: string;
      timeZone: string;
      error: VisitorRefusal | null;
    }
  | { step: 'booked'; at: string; email: string; timeZone: string };

const REFUSALS: readonly VisitorRefusal[] = [
  'account',
  'no_mail',
  'not_bookable',
  'slot_taken',
  'expired',
  'wrong_code',
  'code_expired',
  'too_many',
  'adult',
  'waiting',
];

/**
 * The step the page is at (`?code=`, `?booked=`, `?book-error=`, `?from=`), or null where the
 * item can't be booked from the page at all (no hours, not public, past the horizon), so the
 * page offers only joining.
 */
export async function visitorBookingState(
  ctx: AppContext,
  visitorHost: VisitorHost,
  itemId: string,
  search: URLSearchParams,
): Promise<VisitorBookingState | null> {
  // Without a mailer nothing proves the address: the page offers joining, never a form that
  // could only end in "not available here".
  if (!ctx.mail || !visitorMayBook(visitorHost, ctx.now())) return null;
  const host = hostOf(visitorHost);
  // A claim is this host's and this item's, or it says nothing on this page.
  const ours = (claim: BookingClaim | null): claim is BookingClaim =>
    Boolean(claim && claim.hostId === visitorHost.row.id && claim.itemId === itemId);
  const item = host.items.find((i) => i.id === itemId);
  if (!item || !isBooked(item) || !host.hours) return null;
  const timeZone = host.hours.timeZone;
  const raw = search.get('book-error');
  const error =
    raw && (REFUSALS as readonly string[]).includes(raw) ? (raw as VisitorRefusal) : null;
  const booked = search.get('booked');
  if (booked) {
    const claim = await openClaim(ctx, booked);
    if (ours(claim)) return { step: 'booked', at: claim.at, email: claim.email, timeZone };
  }
  const code = search.get('code');
  if (code) {
    const claim = await openClaim(ctx, code);
    if (ours(claim))
      return { step: 'code', claim: code, email: claim.email, at: claim.at, timeZone, error };
  }
  const slots = await publicSlotsFor(ctx, visitorHost, item, search.get('from'));
  if (!slots) return null;
  // A booking already made says nothing more once its claim runs out; a code's step that ran out
  // says so.
  return { step: 'pick', slots, error: code ? 'expired' : error };
}
