/**
 * A card, a place or a voice note as a mail says it (M16 F3, review 2026-10-17 §6). Someone
 * reached by email reads a card as it reads on Caime: its name and main line, then its facts,
 * times whole on the clock it was set by with the zone named (a mail is read later than it's
 * sent, so never "tomorrow"), and the ways to pay that a Pay card names. A meeting or an
 * appointment carries its calendar invitation, organized by the address it's mailed from, so the
 * answer from the other side's calendar comes back to that address (`mail-answers.ts`) and moves
 * the card; its cancellation carries the update that takes it off their calendar. The words are
 * the sender's, in the sender's language.
 */
import {
  bookingDetails,
  type CardKitId,
  formatDuration,
  isCardKit,
  KITS,
  kitDetails,
  kitHeadline,
  kitStateLabel,
  orderDetails,
  PAYMENT_KIND_LABELS,
  type PayTo,
  payDirection,
  safeLocale,
} from '@caime/core';
import type { AppointmentBooking, PlacedOrder } from '@caime/core/booking';
import { tr } from '@caime/core/i18n';
import { buildInvitation, type IcsPerson } from '@caime/core/ics';
import { dateFormat } from '@caime/core/locale';
import { cardEndMs, meetingLink, meetingVenue } from '@caime/core/meetings';
import { mapsUrl } from '@caime/core/places';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { bookingOf } from './booking';
import { defaultZoneOf } from './geo';
import { asReader } from './i18n';
import type { MailAttachment } from './mail-provider';
import { meetingUid } from './meeting-series';

interface CardPayload {
  kit?: unknown;
  label?: string;
  title?: string;
  fields?: Record<string, unknown>;
  booking?: AppointmentBooking | null;
  order?: PlacedOrder | null;
  payTo?: PayTo | null;
  durationMs?: number;
  lat?: number;
  lng?: number;
  /** Its calendar invitations' count (M16 F5): one higher with each new time. */
  sequence?: number;
}

/** What a mail says for a message that isn't only words and files. */
export interface MailedAs {
  text: string;
  attachments: MailAttachment[];
}

/** Whose clock a card's times are told on: the organization's in its customer thread, else the sender's. */
async function clockOf(
  ctx: AppContext,
  m: Pick<Message, 'conversation_id'>,
  senderId: string,
): Promise<{ zone: string; locale: string }> {
  const sender = await ctx.db
    .selectFrom('users')
    .select(['time_zone', 'locale'])
    .where('id', '=', senderId)
    .executeTakeFirst();
  const org = await ctx.db
    .selectFrom('conversations as c')
    .innerJoin('organizations as o', 'o.id', 'c.org_id')
    .select(['o.booking', 'o.time_zone', 'o.country'])
    .where('c.id', '=', m.conversation_id)
    .where('c.kind', '=', 'business')
    .executeTakeFirst();
  const zone = org
    ? bookingOf(org)?.timeZone || org.time_zone || defaultZoneOf(org.country)
    : sender?.time_zone || 'UTC';
  return { zone, locale: safeLocale(sender?.locale) };
}

/** "Tuesday 21 October 2026, 10:00 (Europe/London)": the whole time, and whose clock it's on. */
export function wholeWhen(v: unknown, zone: string, locale: string): string | null {
  const w = v as { at?: unknown; hasTime?: unknown } | undefined;
  if (typeof w?.at !== 'string') return null;
  const at = new Date(w.at);
  if (Number.isNaN(at.getTime())) return null;
  const timed = w.hasTime !== false;
  const day = dateFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(timed ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: timed ? zone : 'UTC',
  }).format(at);
  return timed ? `${day} (${zone})` : day;
}

/** A Pay card's ways to be paid, as the card shows them: the kind, its name, what to copy. */
function payLines(to: PayTo): string[] {
  if (!to.methods.length && !to.note) return [];
  return [
    tr('Ways to pay {name}:', { name: to.name }),
    ...to.methods.map((w) =>
      [tr(PAYMENT_KIND_LABELS[w.kind]), w.label, w.details, w.url].filter(Boolean).join(' · '),
    ),
    ...(to.note ? [to.note] : []),
  ];
}

/** A card's words: its name and main line, its facts, and what the other side does with it. */
function cardText(p: CardPayload, kit: CardKitId, from: IcsPerson, zone: string, locale: string) {
  const fields = p.fields ?? {};
  const defs = KITS[kit].fields;
  const facts = [
    ...kitDetails(kit, fields, { now: new Date(), timeZone: zone, locale }).map((d) =>
      defs.find((f) => f.key === d.key)?.type === 'datetime'
        ? { ...d, value: wholeWhen(fields[d.key], zone, locale) ?? d.value }
        : d,
    ),
    ...(kit === 'appointment' ? bookingDetails(p.booking, locale) : []),
    ...(kit === 'order_status' ? orderDetails(p.order) : []),
  ];
  const lines = [
    `${tr(p.label ?? KITS[kit].name)}: ${p.title || kitHeadline(kit, fields, locale)}`,
    ...facts.map((d) => `${d.label}: ${d.value}`),
  ];
  if (kit === 'payment_request') {
    lines.push(
      '',
      payDirection(fields) === 'send'
        ? tr('{name} is paying you this.', { name: from.name })
        : tr('{name} asks you to pay this.', { name: from.name }),
    );
    if (p.payTo) lines.push(...payLines(p.payTo));
  }
  if (kit === 'meeting' || kit === 'appointment')
    lines.push(
      '',
      tr('Answer it from your calendar: your answer reaches {name} on Caime.', { name: from.name }),
    );
  return lines.join('\n');
}

/** A meeting's or an appointment's calendar event, as an invitation or its cancellation. */
function invitation(
  ctx: AppContext,
  m: Pick<Message, 'id'>,
  p: CardPayload,
  kit: 'meeting' | 'appointment',
  people: { from: IcsPerson; to: IcsPerson },
  method: 'REQUEST' | 'CANCEL',
  words: string,
): MailAttachment | null {
  const start = (p.fields?.start ?? {}) as { at?: unknown; hasTime?: unknown };
  const at = typeof start.at === 'string' ? new Date(start.at) : null;
  // A day without a time is no event in someone's calendar: the words say it.
  if (!at || Number.isNaN(at.getTime()) || start.hasTime === false) return null;
  const end = new Date(
    cardEndMs(at.getTime(), { durationMinutes: p.fields?.durationMinutes, booking: p.booking }),
  );
  const place =
    (typeof p.fields?.place === 'string' ? p.fields.place.trim() : '') || p.booking?.where || '';
  // Each change a higher number (RFC 5546): a new time replaces the invitation, and the
  // cancellation replaces the last time sent (M16 F5).
  const sequence = typeof p.sequence === 'number' ? p.sequence : 0;
  const ics = buildInvitation({
    method,
    uid: meetingUid(m.id, null, kit),
    sequence: method === 'CANCEL' ? sequence + 1 : sequence,
    now: ctx.now(),
    start: at,
    end,
    summary: p.title || tr(KITS[kit].name),
    description: words,
    location: place || null,
    url: meetingVenue(place) === 'link' ? meetingLink(place) : null,
    organizer: people.from,
    attendee: people.to,
  });
  return {
    name: method === 'CANCEL' ? 'cancel.ics' : 'invite.ics',
    mime: `text/calendar; method=${method}; charset=UTF-8`,
    bytes: Buffer.from(ics, 'utf8'),
  };
}

/**
 * What a mail says for a card, a place or a voice note (its recording rides as the message's
 * file), in the sender's language; null for words and files, which go as they are.
 */
export async function mailedAs(
  ctx: AppContext,
  m: Message,
  people: { senderId: string; from: IcsPerson; to: IcsPerson },
): Promise<MailedAs | null> {
  const p = (m.payload ?? {}) as CardPayload;
  if (m.kind === 'voice')
    return asReader(ctx, people.senderId, async () => ({
      text: p.durationMs
        ? tr('Voice note, {duration}', { duration: formatDuration(p.durationMs) })
        : tr('Voice note'),
      attachments: [],
    }));
  if (m.kind === 'location') {
    const label = typeof p.label === 'string' ? p.label : '';
    const url =
      typeof p.lat === 'number' && typeof p.lng === 'number'
        ? mapsUrl({ lat: p.lat, lng: p.lng })
        : `https://www.openstreetmap.org/search?query=${encodeURIComponent(label)}`;
    return asReader(ctx, people.senderId, async () => ({
      text: [label || tr('A place'), url].join('\n'),
      attachments: [],
    }));
  }
  if (m.kind !== 'kit' || !isCardKit(p.kit)) return null;
  const kit = p.kit;
  const { zone, locale } = await clockOf(ctx, m, people.senderId);
  return asReader(ctx, people.senderId, async () => {
    const text = cardText(p, kit, people.from, zone, locale);
    const event =
      kit === 'meeting' || kit === 'appointment'
        ? invitation(ctx, m, p, kit, people, 'REQUEST', text)
        : null;
    return { text, attachments: event ? [event] : [] };
  });
}

/**
 * A meeting or an appointment mailed from here, given another time (M16 F5): its words as they
 * now read, under "New time", and the invitation one sequence on, so their calendar moves it.
 */
export async function updateOf(
  ctx: AppContext,
  m: Message,
  people: { senderId: string; from: IcsPerson; to: IcsPerson },
): Promise<MailedAs | null> {
  const p = (m.payload ?? {}) as CardPayload;
  if (m.kind !== 'kit' || (p.kit !== 'meeting' && p.kit !== 'appointment')) return null;
  const kit = p.kit;
  const { zone, locale } = await clockOf(ctx, m, people.senderId);
  return asReader(ctx, people.senderId, async () => {
    const text = `${tr('New time')}\n${cardText(p, kit, people.from, zone, locale)}`;
    const event = invitation(ctx, m, p, kit, people, 'REQUEST', text);
    return { text, attachments: event ? [event] : [] };
  });
}

/** A meeting or an appointment mailed from here, cancelled: the words, and its calendar's update. */
export async function cancellationOf(
  ctx: AppContext,
  m: Message,
  people: { senderId: string; from: IcsPerson; to: IcsPerson },
): Promise<MailedAs | null> {
  const p = (m.payload ?? {}) as CardPayload;
  if (m.kind !== 'kit' || (p.kit !== 'meeting' && p.kit !== 'appointment')) return null;
  const kit = p.kit;
  const { zone, locale } = await clockOf(ctx, m, people.senderId);
  return asReader(ctx, people.senderId, async () => {
    const when = wholeWhen(p.fields?.start, zone, locale);
    const text = [
      `${tr(kitStateLabel('cancelled'))}: ${p.title || tr(KITS[kit].name)}`,
      ...(when ? [when] : []),
    ].join('\n');
    const event = invitation(ctx, m, p, kit, people, 'CANCEL', text);
    return { text, attachments: event ? [event] : [] };
  });
}
