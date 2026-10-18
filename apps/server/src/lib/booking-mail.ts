/**
 * What a customer who booked before an account hears (R97 (1), block C1b): they have no device on
 * Caime to be told on, so when the team confirms or cancels their appointment it comes by mail,
 * with the event for their calendar (an invitation to add it, an update to take it off) and the
 * link that brings the conversation into an account made with the same address (R93; the claim
 * asks that address's code, review 2026-10-17 §2 H1). Mail stays English and plain (R48) and goes
 * after the response (`ctx.defer`); a customer with an account is told in Caime as anyone is.
 */
import { firstName } from '@caime/core/format';
import { buildInvitation } from '@caime/core/ics';
import { seriesOf } from '@caime/core/series';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { bookingOf } from './booking';
import type { CustomerMask } from './business';
import { fromAddress } from './email';
import { meetingUid } from './meeting-series';

type Moved = 'confirmed' | 'cancelled';

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
 * The mail for a confirmed or cancelled appointment whose customer is a provisional person (one
 * who booked from a page, or wrote in by mail), sent after the response. Nothing for anyone else.
 */
export async function mailProvisionalBooker(
  ctx: AppContext,
  m: Message,
  business: CustomerMask,
  to: Moved,
): Promise<void> {
  const mail = ctx.mail;
  if (!mail) return;
  const customer = await ctx.db
    .selectFrom('users')
    .select(['kind', 'email', 'display_name'])
    .where('id', '=', business.customerId)
    .executeTakeFirst();
  if (customer?.kind !== 'provisional' || !customer.email) return;
  const p = (m.payload ?? {}) as {
    title?: string;
    fields?: { title?: string; start?: { at?: string } };
    booking?: { name?: string; endAt?: string | null; where?: string | null };
  };
  const start = new Date(String(p.fields?.start?.at ?? ''));
  if (Number.isNaN(start.getTime())) return;
  const ends = p.booking?.endAt ? new Date(p.booking.endAt) : null;
  const end =
    ends && !Number.isNaN(ends.getTime()) ? ends : new Date(start.getTime() + 30 * 60_000);
  const org = await ctx.db
    .selectFrom('organizations')
    .select(['booking', 'time_zone'])
    .where('id', '=', business.orgId)
    .executeTakeFirst();
  const zone = (org && bookingOf(org)?.timeZone) || org?.time_zone || 'UTC';
  const what = String(p.booking?.name || p.fields?.title || p.title || 'Your booking').slice(
    0,
    120,
  );
  const where = p.booking?.where ?? null;
  const base = ctx.config.PUBLIC_URL.replace(/\/+$/, '');
  const link = `${base}/sign-up?link=${encodeURIComponent(`/c/${m.conversation_id}`)}`;
  const confirmed = to === 'confirmed';
  const ics = buildInvitation({
    method: confirmed ? 'REQUEST' : 'CANCEL',
    // The same event the calendar feed names (R58): one appointment, in every calendar alike.
    uid: meetingUid(m.id, seriesOf(m.payload as Parameters<typeof seriesOf>[0]), 'appointment'),
    sequence: confirmed ? 0 : 1,
    now: ctx.now(),
    start,
    end,
    summary: `${what} with ${business.orgName}`,
    description: `${business.orgName} on Caime: ${link}`,
    location: where,
    url: link,
    organizer: { name: business.orgName, email: fromAddress(ctx.config.EMAIL_FROM) },
    attendee: { name: customer.display_name, email: customer.email },
  });
  const name = firstName(customer.display_name);
  const to_ = customer.email;
  ctx.defer('email.booking', () =>
    mail.send({
      to: to_,
      kind: 'booking',
      subject: `${confirmed ? 'Confirmed' : 'Cancelled'}: ${what} with ${business.orgName}`,
      text: [
        name && !name.includes('@') ? `Hi ${name},` : 'Hello,',
        '',
        `${business.orgName} ${confirmed ? 'confirmed' : 'cancelled'} your booking:`,
        '',
        what,
        inZone(start, zone),
        ...(where ? [where] : []),
        '',
        confirmed
          ? 'The invitation attached adds it to your calendar.'
          : 'The update attached takes it off your calendar.',
        '',
        `To write to ${business.orgName}, or to change or cancel it, join Caime with this address and the conversation will be there: ${link}`,
        '',
        'Caime',
      ].join('\n'),
      icalEvent: { method: confirmed ? 'REQUEST' : 'CANCEL', content: ics },
    }),
  );
}
