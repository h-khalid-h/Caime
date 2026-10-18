/**
 * What a customer who booked before an account hears (R97 (1), blocks C1b and C1c): they have no
 * device on Caime to be told on, so when the host confirms or cancels their appointment it comes
 * by mail, with the event for their calendar (an invitation to add it, an update to take it off),
 * and a confirmed one is recalled the day before it. Each carries the link that brings the
 * conversation into an account made with the same address (R93; the claim asks that address's
 * code, review 2026-10-17 §2 H1). The host is an organization, named and never a team member
 * (R15), or the person whose public item it was. Mail stays English and plain (R48): the
 * confirmation goes after the response (`ctx.defer`), the reminder from its job, whose payload
 * holds ids alone. A customer with an account is told in Caime as anyone is.
 */
import { firstName } from '@caime/core/format';
import { buildInvitation } from '@caime/core/ics';
import { seriesOf } from '@caime/core/series';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import { bookingOf } from './booking';
import { customerMask } from './business';
import { fromAddress, type Mail } from './email';
import { enqueue, registerJob } from './jobs';
import { meetingUid } from './meeting-series';

type Moved = 'confirmed' | 'cancelled';

/** A confirmed booking is recalled this long before it starts. */
export const REMIND_BEFORE_MS = 24 * 3_600_000;
/**
 * Unless it was confirmed this close to that moment: a confirmation within a day and a half of
 * the start is its own reminder.
 */
export const REMIND_FRESH_MS = 12 * 3_600_000;
const REMIND_JOB = 'booking.remind';

/** The booking as its booker's mail tells it. */
interface Booked {
  to: string;
  name: string;
  /** Who it's with: the organization's name, or the person's. */
  host: string;
  what: string;
  start: Date;
  end: Date;
  zone: string;
  where: string | null;
  link: string;
  uid: string;
}

interface AppointmentPayload {
  kit?: string;
  state?: string;
  title?: string;
  fields?: { title?: string; start?: { at?: string } };
  booking?: { name?: string; endAt?: string | null; where?: string | null; hostId?: string };
}

/** "Tuesday 20 October 2026 at 10:00 (Africa/Cairo)": the host's own clock, as the page showed it. */
function inZone(at: Date, zone: string): string {
  try {
    const when = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: zone,
    }).format(at);
    return `${when} (${zone})`;
  } catch {
    return `${at.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
  }
}

/**
 * The booking as its booker's mail tells it, or null when nobody is to be mailed: an appointment
 * whose customer is a provisional person with an address, in an organization's customer
 * conversation or in a one-to-one booked from a person's catalog (`booking.hostId`, which only
 * `bookingFor` writes). The customer is read first, so a customer with an account costs one
 * query.
 */
async function bookedFor(ctx: AppContext, m: Message): Promise<Booked | null> {
  const p = (m.payload ?? {}) as AppointmentPayload;
  if (m.kind !== 'kit' || p.kit !== 'appointment') return null;
  const start = new Date(String(p.fields?.start?.at ?? ''));
  if (Number.isNaN(start.getTime())) return null;
  const business = await customerMask(ctx.db, m.conversation_id);
  const hostId = business ? null : (p.booking?.hostId ?? null);
  let customerId = business?.customerId ?? null;
  if (hostId) {
    // A one-to-one: the customer is the other one in it.
    const others = await ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', m.conversation_id)
      .where('user_id', '<>', hostId)
      .execute();
    customerId = others.length === 1 ? (others[0]?.user_id ?? null) : null;
  }
  if (!customerId) return null;
  const customer = await ctx.db
    .selectFrom('users')
    .select(['kind', 'email', 'display_name'])
    .where('id', '=', customerId)
    .executeTakeFirst();
  if (customer?.kind !== 'provisional' || !customer.email) return null;
  let host: string;
  let zone: string;
  if (business) {
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['booking', 'time_zone'])
      .where('id', '=', business.orgId)
      .executeTakeFirst();
    host = business.orgName;
    zone = (org && bookingOf(org)?.timeZone) || org?.time_zone || 'UTC';
  } else {
    const person = await ctx.db
      .selectFrom('users')
      .select(['display_name', 'booking', 'time_zone'])
      .where('id', '=', hostId as string)
      .executeTakeFirst();
    if (!person) return null;
    host = person.display_name;
    zone = bookingOf(person)?.timeZone || person.time_zone || 'UTC';
  }
  const ends = p.booking?.endAt ? new Date(p.booking.endAt) : null;
  const base = ctx.config.PUBLIC_URL.replace(/\/+$/, '');
  const name = firstName(customer.display_name);
  return {
    to: customer.email,
    name: name && !name.includes('@') ? name : '',
    host,
    what: String(p.booking?.name || p.fields?.title || p.title || 'Your booking').slice(0, 120),
    start,
    end: ends && !Number.isNaN(ends.getTime()) ? ends : new Date(start.getTime() + 30 * 60_000),
    zone,
    where: p.booking?.where ?? null,
    link: `${base}/sign-up?link=${encodeURIComponent(`/c/${m.conversation_id}`)}`,
    // The same event the calendar feed names (R58): one appointment, in every calendar alike.
    uid: meetingUid(m.id, seriesOf(m.payload as Parameters<typeof seriesOf>[0]), 'appointment'),
  };
}

/** The lines every booking mail ends with: the time, and the way to follow it. */
function body(b: Booked, opening: string, middle: string[]): string {
  return [
    b.name ? `Hi ${b.name},` : 'Hello,',
    '',
    opening,
    '',
    b.what,
    inZone(b.start, b.zone),
    ...(b.where ? [b.where] : []),
    '',
    ...middle,
    `To write to ${b.host}, or to change or cancel it, join Caime with this address and the conversation will be there: ${b.link}`,
    '',
    'Caime',
  ].join('\n');
}

/**
 * The mail for a confirmed or cancelled appointment whose customer is a provisional person (one
 * who booked from a page, or wrote in by mail), sent after the response; a confirmed one queues
 * its reminder. Nothing for anyone else.
 */
export async function mailProvisionalBooker(ctx: AppContext, m: Message, to: Moved): Promise<void> {
  const mail = ctx.mail;
  if (!mail) return;
  const b = await bookedFor(ctx, m);
  if (!b) return;
  const confirmed = to === 'confirmed';
  const ics = buildInvitation({
    method: confirmed ? 'REQUEST' : 'CANCEL',
    uid: b.uid,
    sequence: confirmed ? 0 : 1,
    now: ctx.now(),
    start: b.start,
    end: b.end,
    summary: `${b.what} with ${b.host}`,
    description: `${b.host} on Caime: ${b.link}`,
    location: b.where,
    url: b.link,
    organizer: { name: b.host, email: fromAddress(ctx.config.EMAIL_FROM) },
    attendee: { name: b.name || b.to, email: b.to },
  });
  ctx.defer('email.booking', () =>
    mail.send({
      to: b.to,
      kind: 'booking',
      subject: `${confirmed ? 'Confirmed' : 'Cancelled'}: ${b.what} with ${b.host}`,
      text: body(b, `${b.host} ${confirmed ? 'confirmed' : 'cancelled'} your booking:`, [
        confirmed
          ? 'The invitation attached adds it to your calendar.'
          : 'The update attached takes it off your calendar.',
        '',
      ]),
      icalEvent: { method: confirmed ? 'REQUEST' : 'CANCEL', content: ics },
    }),
  );
  if (confirmed) await queueReminder(ctx, m.id, b.start);
}

/**
 * The day before (R97 (1): no-shows are the host's cost): one job per card and start, as the
 * brief's, so a card moved to another time gets another and the old one finds it elsewhere.
 */
async function queueReminder(ctx: AppContext, messageId: string, start: Date): Promise<void> {
  const runAt = new Date(start.getTime() - REMIND_BEFORE_MS);
  if (runAt.getTime() - ctx.now().getTime() < REMIND_FRESH_MS) return;
  await enqueue(
    ctx,
    REMIND_JOB,
    { messageId, at: start.toISOString() },
    { runAt, dedupeKey: `${REMIND_JOB}:${messageId}:${start.toISOString()}`, maxAttempts: 3 },
  );
}

/** The reminder, from what the card says when it runs: still confirmed, still then, still theirs. */
function reminderMail(b: Booked): Mail {
  return {
    to: b.to,
    kind: 'booking',
    subject: `Reminder: ${b.what} with ${b.host}`,
    text: body(b, `A reminder of your booking with ${b.host}:`, []),
  };
}

async function remindJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const mail = ctx.mail;
  if (!mail) return;
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', String(payload.messageId))
    .executeTakeFirst();
  if (!m || m.deleted_at || (m.payload as AppointmentPayload | null)?.state !== 'confirmed') return;
  const b = await bookedFor(ctx, m);
  // Moved, claimed by an account since (told in Caime), or begun already: nothing to say.
  if (!b || b.start.toISOString() !== String(payload.at)) return;
  if (b.start.getTime() <= ctx.now().getTime()) return;
  await mail.send(reminderMail(b));
  ctx.metrics.publicBookings.inc({ outcome: 'reminded' });
}

export function registerBookingReminders(): void {
  registerJob(REMIND_JOB, remindJob);
}
