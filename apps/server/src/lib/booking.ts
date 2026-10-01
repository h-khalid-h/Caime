/**
 * Bookings (R51): an organization's bookable hours (`organizations.booking`, core
 * `BookingHours`) and the slots open in them, worked out on request from the appointment cards
 * in its customer conversations (`orgBookings`): asked or confirmed, each holds a slot. The AI
 * agent offers the next few; a customer, or the team, books from them with an appointment card.
 */
import { type BookingHours, openSlots, zonedParts } from '@caime/core';
import type { AppContext } from '../context';
import type { Organization } from '../db/schema';
import { orgBookings } from './calendar';

/** The hours as kept, or null. */
export function bookingOf(org: Pick<Organization, 'booking'>): BookingHours | null {
  return (org.booking as BookingHours | null) ?? null;
}

/** The slots open between two instants, at most `limit`, soonest first. */
export async function openSlotsFor(
  ctx: AppContext,
  org: Pick<Organization, 'id' | 'booking'>,
  window: { from: Date; to: Date },
  limit = 200,
): Promise<{ hours: BookingHours; slots: Date[] } | null> {
  const hours = bookingOf(org);
  if (!hours) return null;
  const booked = await orgBookings(ctx, org.id, { from: window.from, until: window.to });
  const busy = booked.map((b) => {
    const start = new Date(b.at);
    return { start, end: new Date(start.getTime() + hours.slotMinutes * 60_000) };
  });
  return { hours, slots: openSlots(hours, { ...window, now: ctx.now(), busy, limit }) };
}

/** "Thursday 8 October, 10:00" in the organization's zone, for the agent and its customer. */
export function slotLine(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    p.weekday
  ];
  const month = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][p.month - 1];
  return `${weekday} ${p.day} ${month}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
