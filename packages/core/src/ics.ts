/**
 * A calendar feed as calendar apps read it (RFC 5545, PRD §72): Google Calendar, Outlook and
 * Apple Calendar subscribe to its address and show what's in it, and Caime stays the record of
 * it. Text is escaped so nothing in a title can start a line of its own, lines are folded at 75
 * octets without splitting a character, and every line ends in CRLF.
 */

import { zonedTimeToUtc } from './time';

export interface IcsEvent {
  /** The same on every read, so an app updates its event rather than adding another. */
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  /** Where it is in Caime. Only an http(s) address is written. */
  url?: string | null;
  /** A timed event: from `start` to `end` (or `start`), in UTC. */
  start?: Date;
  end?: Date;
  /** An all-day event on this date (YYYY-MM-DD) of the person's own calendar. */
  date?: string;
  /** When it last changed. */
  updated: Date;
  /** A meeting makes its time busy; a due date doesn't. */
  busy?: boolean;
  status?: 'CONFIRMED' | 'TENTATIVE';
}

export interface IcsCalendar {
  name: string;
  description?: string;
  /** The person's time zone, which apps show all-day events in. */
  timeZone?: string;
  /** How often apps are asked to read it again. */
  refreshMinutes?: number;
  now: Date;
  events: IcsEvent[];
}

/** Control characters other than a tab or a line break have no place in a calendar's text. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: that is what it removes
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** A TEXT value: backslashes, semicolons, commas and line breaks escaped. */
export function icsText(value: string): string {
  return value
    .replace(CONTROL, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const utf8Length = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/**
 * A content line folded at 75 octets (RFC 5545 §3.1): each continuation starts with a space,
 * which counts, and a character is never split across two lines.
 */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = utf8Length(ch.codePointAt(0) ?? 0);
    const limit = out.length === 0 ? 75 : 74;
    if (size + n > limit) {
      out.push(current);
      current = ch;
      size = n;
    } else {
      current += ch;
      size += n;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

const utc = (d: Date) =>
  d
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD as a DATE value, and the day after it (an all-day event ends the next day). */
function days(date: string): [string, string] {
  const m = DATE.exec(date);
  if (!m) throw new Error(`Not a date: ${date}`);
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  return [`${m[1]}${m[2]}${m[3]}`, next.toISOString().slice(0, 10).replace(/-/g, '')];
}

/** Only an address that is one: no spaces, no line breaks, http or https. */
const safeUrl = (url: string) => /^https?:\/\/[^\s"<>\\^`{|}]+$/.test(url);

export function buildIcs(cal: IcsCalendar): string {
  const refresh = Math.max(15, Math.round(cal.refreshMinutes ?? 60));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Caime//Calendar feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(cal.name)}`,
    ...(cal.description ? [`X-WR-CALDESC:${icsText(cal.description)}`] : []),
    ...(cal.timeZone ? [`X-WR-TIMEZONE:${icsText(cal.timeZone)}`] : []),
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refresh}M`,
    `X-PUBLISHED-TTL:PT${refresh}M`,
  ];
  for (const e of cal.events) {
    lines.push('BEGIN:VEVENT', `UID:${icsText(e.uid)}`, `DTSTAMP:${utc(cal.now)}`);
    if (e.date) {
      const [start, end] = days(e.date);
      lines.push(`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`);
    } else if (e.start) {
      const end = e.end && e.end > e.start ? e.end : e.start;
      lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(end)}`);
    } else {
      throw new Error(`An event needs a date or a start: ${e.uid}`);
    }
    lines.push(`SUMMARY:${icsText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.url && safeUrl(e.url)) lines.push(`URL:${e.url}`);
    lines.push(
      `LAST-MODIFIED:${utc(e.updated)}`,
      `STATUS:${e.status ?? 'CONFIRMED'}`,
      `TRANSP:${e.busy ? 'OPAQUE' : 'TRANSPARENT'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** A person in an invitation: a name and an address that is one (no line breaks, no `:`). */
export interface IcsPerson {
  name: string;
  email: string;
}

const safeEmail = (e: string) => /^[^\s@:;,"<>]+@[^\s@:;,"<>]+\.[^\s@:;,"<>]+$/.test(e);
/** A parameter value: quoted, without the characters a quoted value can't hold. */
const param = (v: string) => `"${v.replace(/[\r\n"]/g, ' ').replace(CONTROL, '')}"`;

/**
 * One meeting as an invitation by mail (R84): `METHOD:REQUEST`, which Gmail, Outlook and Apple
 * Mail put in the guest's calendar with Accept and Decline, or `CANCEL` to take it out. The
 * same `uid` and a higher `sequence` update what's there.
 */
export function buildInvitation(i: {
  method: 'REQUEST' | 'CANCEL';
  uid: string;
  sequence: number;
  now: Date;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizer: IcsPerson;
  attendee: IcsPerson;
}): string {
  if (!safeEmail(i.organizer.email) || !safeEmail(i.attendee.email))
    throw new Error('An invitation needs real addresses');
  const end = i.end > i.start ? i.end : i.start;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Caime//Meeting//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${i.method}`,
    'BEGIN:VEVENT',
    `UID:${icsText(i.uid)}`,
    `SEQUENCE:${Math.max(0, Math.floor(i.sequence))}`,
    `DTSTAMP:${utc(i.now)}`,
    `DTSTART:${utc(i.start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${icsText(i.summary)}`,
    ...(i.description ? [`DESCRIPTION:${icsText(i.description)}`] : []),
    ...(i.location ? [`LOCATION:${icsText(i.location)}`] : []),
    ...(i.url && safeUrl(i.url) ? [`URL:${i.url}`] : []),
    `ORGANIZER;CN=${param(i.organizer.name)}:mailto:${i.organizer.email}`,
    `ATTENDEE;CN=${param(i.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${i.attendee.email}`,
    `STATUS:${i.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** A guest's answer to an invitation, as their calendar app sends it back (`METHOD:REPLY`). */
export interface IcsReply {
  uid: string;
  attendee: string;
  answer: 'accepted' | 'declined' | 'tentative';
}

const ANSWERS: Record<string, IcsReply['answer']> = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  TENTATIVE: 'tentative',
};

/**
 * Reads a calendar app's reply (R86): its event's UID and the one attendee's PARTSTAT. Null for
 * anything that isn't a reply with exactly one answer. Never throws on what came by mail.
 */
export function readReply(text: string): IcsReply | null {
  if (text.length > 64 * 1024) return null;
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const value = (name: string) => lines.filter((l) => l.toUpperCase().startsWith(`${name}`));
  if (!value('METHOD:').some((l) => l.slice(7).trim().toUpperCase() === 'REPLY')) return null;
  const uid = value('UID:')[0]?.slice(4).trim();
  const attendees = value('ATTENDEE');
  if (!uid || attendees.length !== 1) return null;
  const line = attendees[0] ?? '';
  const colon = line.toLowerCase().lastIndexOf('mailto:');
  if (colon < 0) return null;
  const attendee = line
    .slice(colon + 7)
    .trim()
    .toLowerCase();
  const stat = /;PARTSTAT=([A-Z-]+)/i.exec(line.slice(0, colon))?.[1]?.toUpperCase();
  const answer = stat ? ANSWERS[stat] : undefined;
  if (!answer || !/^[^\s@]+@[^\s@]+$/.test(attendee)) return null;
  return { uid, attendee, answer };
}

// --- Invitations from someone's calendar (M16 F4) -----------------------------------------------

/**
 * Windows' time zone names, as Outlook writes them in an invitation's TZID, for the zones they
 * stand for (CLDR's windowsZones, each name's main zone). Google and Apple write the zone itself.
 */
const WINDOWS_ZONES: Record<string, string> = {
  'Dateline Standard Time': 'Etc/GMT+12',
  'UTC-11': 'Etc/GMT+11',
  'Aleutian Standard Time': 'America/Adak',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Alaskan Standard Time': 'America/Anchorage',
  'Pacific Standard Time (Mexico)': 'America/Tijuana',
  'Pacific Standard Time': 'America/Los_Angeles',
  'US Mountain Standard Time': 'America/Phoenix',
  'Mountain Standard Time (Mexico)': 'America/Mazatlan',
  'Mountain Standard Time': 'America/Denver',
  'Central America Standard Time': 'America/Guatemala',
  'Central Standard Time': 'America/Chicago',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Canada Central Standard Time': 'America/Regina',
  'SA Pacific Standard Time': 'America/Bogota',
  'Eastern Standard Time (Mexico)': 'America/Cancun',
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indiana/Indianapolis',
  'Venezuela Standard Time': 'America/Caracas',
  'Paraguay Standard Time': 'America/Asuncion',
  'Atlantic Standard Time': 'America/Halifax',
  'Central Brazilian Standard Time': 'America/Cuiaba',
  'SA Western Standard Time': 'America/La_Paz',
  'Pacific SA Standard Time': 'America/Santiago',
  'Newfoundland Standard Time': 'America/St_Johns',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'SA Eastern Standard Time': 'America/Cayenne',
  'Montevideo Standard Time': 'America/Montevideo',
  'Azores Standard Time': 'Atlantic/Azores',
  'Cape Verde Standard Time': 'Atlantic/Cape_Verde',
  UTC: 'UTC',
  'Coordinated Universal Time': 'UTC',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'Morocco Standard Time': 'Africa/Casablanca',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'Central European Standard Time': 'Europe/Warsaw',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'Jordan Standard Time': 'Asia/Amman',
  'GTB Standard Time': 'Europe/Bucharest',
  'Middle East Standard Time': 'Asia/Beirut',
  'Egypt Standard Time': 'Africa/Cairo',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'Syria Standard Time': 'Asia/Damascus',
  'West Bank Standard Time': 'Asia/Hebron',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'FLE Standard Time': 'Europe/Kiev',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Sudan Standard Time': 'Africa/Khartoum',
  'Kaliningrad Standard Time': 'Europe/Kaliningrad',
  'Libya Standard Time': 'Africa/Tripoli',
  'Namibia Standard Time': 'Africa/Windhoek',
  'Arabic Standard Time': 'Asia/Baghdad',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Arab Standard Time': 'Asia/Riyadh',
  'Belarus Standard Time': 'Europe/Minsk',
  'Russian Standard Time': 'Europe/Moscow',
  'E. Africa Standard Time': 'Africa/Nairobi',
  'Iran Standard Time': 'Asia/Tehran',
  'Arabian Standard Time': 'Asia/Dubai',
  'Azerbaijan Standard Time': 'Asia/Baku',
  'Caucasus Standard Time': 'Asia/Yerevan',
  'Georgian Standard Time': 'Asia/Tbilisi',
  'Mauritius Standard Time': 'Indian/Mauritius',
  'Afghanistan Standard Time': 'Asia/Kabul',
  'West Asia Standard Time': 'Asia/Tashkent',
  'Pakistan Standard Time': 'Asia/Karachi',
  'India Standard Time': 'Asia/Kolkata',
  'Sri Lanka Standard Time': 'Asia/Colombo',
  'Nepal Standard Time': 'Asia/Kathmandu',
  'Central Asia Standard Time': 'Asia/Almaty',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'Myanmar Standard Time': 'Asia/Yangon',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'China Standard Time': 'Asia/Shanghai',
  'Singapore Standard Time': 'Asia/Singapore',
  'Taipei Standard Time': 'Asia/Taipei',
  'W. Australia Standard Time': 'Australia/Perth',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Central Standard Time': 'Australia/Darwin',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'West Pacific Standard Time': 'Pacific/Port_Moresby',
  'Tasmania Standard Time': 'Australia/Hobart',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'Fiji Standard Time': 'Pacific/Fiji',
  'Tonga Standard Time': 'Pacific/Tongatapu',
  'Samoa Standard Time': 'Pacific/Apia',
};

const zoneKnown = new Map<string, boolean>();

/** Whether this runtime knows a zone by that name ("Europe/London"): asked once a name. */
export function isTimeZone(zone: string): boolean {
  if (!zone || zone.length > 64) return false;
  let known = zoneKnown.get(zone);
  if (known === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      known = true;
    } catch {
      known = false;
    }
    if (zoneKnown.size > 512) zoneKnown.clear();
    zoneKnown.set(zone, known);
  }
  return known;
}

/** An invitation from someone's calendar (RFC 5546), as Caime reads it: one event, its time whole. */
export interface IcsInvitation {
  method: 'REQUEST' | 'CANCEL';
  uid: string;
  /** Each change its organizer makes counts up: a lower one is older than what's kept. */
  sequence: number;
  summary: string | null;
  /** What its organizer wrote of it, as written (`invitationWords` reads it for a person). */
  description: string | null;
  /** Where: its location, else its video call's address (Google's, Teams'), else its link. */
  place: string | null;
  start: Date;
  end: Date;
  /** A day without a time: its start is that day at 09:00 on the reader's clock, as a card's is. */
  hasTime: boolean;
  organizer: IcsPerson | null;
  /** Who it's to, by address, lowercased. */
  attendees: string[];
}

const TEXT_ESCAPES: Record<string, string> = { n: '\n', N: '\n', ',': ',', ';': ';', '\\': '\\' };

/** A TEXT value as written: its escapes undone, nothing that could start a line kept. */
function unescapeText(value: string): string {
  return value
    .replace(/\\([nN,;\\])/g, (_, c: string) => TEXT_ESCAPES[c] ?? c)
    .replace(CONTROL, '')
    .trim();
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** A content line as its name, parameters and value: a quoted parameter may hold ':' or ';'. */
function property(line: string): Property | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1) return null;
  const parts: string[] = [];
  let part = '';
  quoted = false;
  for (const c of line.slice(0, colon)) {
    if (c === '"') quoted = !quoted;
    if (c === ';' && !quoted) {
      parts.push(part);
      part = '';
    } else part += c;
  }
  parts.push(part);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: (parts[0] ?? '').toUpperCase(), params, value: line.slice(colon + 1) };
}

/** The zone a TZID names: itself, Windows' name for it, or a calendar app's prefixed path. */
function zoneNamed(tzid: string): string | null {
  const name = tzid.trim();
  const zone = WINDOWS_ZONES[name] ?? name.replace(/^\/[^/]+\/[^/]+\//, '');
  return isTimeZone(zone) ? zone : null;
}

const STAMP = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?(Z)?)?$/;

/** A DATE or a DATE-TIME as an instant: UTC, in its zone, or a floating time on the reader's clock. */
function instantOf(p: Property, readerZone: string): { at: Date; hasTime: boolean } | null {
  const m = STAMP.exec(p.value.trim());
  if (!m) return null;
  const day = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (day.month < 1 || day.month > 12 || day.day < 1 || day.day > 31) return null;
  if (m[4] === undefined || p.params.VALUE?.toUpperCase() === 'DATE')
    return { at: zonedTimeToUtc({ ...day, hour: 9, minute: 0 }, readerZone), hasTime: false };
  const time = { ...day, hour: Number(m[4]), minute: Number(m[5]) };
  if (time.hour > 23 || time.minute > 59) return null;
  if (m[6])
    return {
      at: new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute)),
      hasTime: true,
    };
  const zone = p.params.TZID ? zoneNamed(p.params.TZID) : readerZone;
  return zone ? { at: zonedTimeToUtc(time, zone), hasTime: true } : null;
}

/** A DURATION (RFC 5545 §3.3.6) in milliseconds; null for anything that isn't one going forward. */
function durationMs(value: string): number | null {
  const v = value.trim();
  const m = /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v);
  if (!m || /^\+?PT?$/.test(v)) return null;
  const [w, d, h, min, s] = m.slice(1).map((x) => Number(x ?? 0));
  return ((((w ?? 0) * 7 + (d ?? 0)) * 24 + (h ?? 0)) * 60 + (min ?? 0)) * 60_000 + (s ?? 0) * 1000;
}

const mailtoOf = (p: Property | undefined): string | null => {
  const m = /^mailto:(.+)$/i.exec(p?.value.trim() ?? '');
  const email = m?.[1]?.trim().toLowerCase() ?? '';
  return safeEmail(email) ? email : null;
};

/** A Where longer than this is no place anyone wrote. */
const PLACE_MAX = 2000;

/**
 * Reads an invitation as a calendar app sends one (`METHOD:REQUEST`, or `CANCEL` to take it
 * back): exactly one event, which neither repeats nor stands for a time of a series, its time
 * read whole (a zone by name, Windows' names, UTC, a day, or a floating time on the reader's
 * clock). Null for anything else, a zone it can't name, or what isn't a calendar at all; it
 * never throws on what came by mail.
 */
export function readInvitation(text: string, readerZone: string): IcsInvitation | null {
  if (text.length > 64 * 1024) return null;
  try {
    let method: string | null = null;
    const events: Property[][] = [];
    let event: Property[] | null = null;
    // A component inside the event (an alarm) is its own, never the event's.
    let nested = 0;
    for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
      const p = property(line);
      if (!p) continue;
      const value = p.value.trim().toUpperCase();
      if (p.name === 'BEGIN') {
        if (event) nested++;
        else if (value === 'VEVENT') event = [];
      } else if (p.name === 'END') {
        if (event && nested) nested--;
        else if (event && value === 'VEVENT') {
          events.push(event);
          event = null;
        }
      } else if (event) {
        if (!nested) event.push(p);
      } else if (p.name === 'METHOD') method = value;
    }
    if ((method !== 'REQUEST' && method !== 'CANCEL') || events.length !== 1) return null;
    const ev = events[0] ?? [];
    const get = (name: string) => ev.find((x) => x.name === name);
    if (get('RRULE') || get('RDATE') || get('RECURRENCE-ID')) return null;
    const uid = get('UID')?.value.trim();
    if (!uid || uid.length > 255) return null;
    const dtstart = get('DTSTART');
    const start = dtstart ? instantOf(dtstart, readerZone) : null;
    // A cancellation is known by its event alone; an invitation needs its time.
    if (!start && method === 'REQUEST') return null;
    const at = start?.at ?? new Date(0);
    const dtend = get('DTEND');
    const end = dtend ? instantOf(dtend, readerZone)?.at : null;
    const lasts = get('DURATION') ? durationMs(get('DURATION')?.value ?? '') : null;
    const endMs =
      end?.getTime() ??
      (lasts !== null ? at.getTime() + lasts : at.getTime() + (start?.hasTime ? 3_600_000 : 0));
    const textOf = (name: string) => {
      const v = get(name)?.value;
      const t = v ? unescapeText(v) : '';
      return t || null;
    };
    const organizer = get('ORGANIZER');
    const organizerEmail = mailtoOf(organizer);
    // Where: what its organizer wrote, unless that only names its call (Outlook's "Microsoft
    // Teams Meeting"), whose address then says it; else its call's address; else its link.
    const location = textOf('LOCATION');
    const url = get('URL')?.value.trim() ?? '';
    const call =
      textOf('X-GOOGLE-CONFERENCE') ??
      textOf('X-MICROSOFT-SKYPETEAMSMEETINGURL') ??
      (safeUrl(url) ? url : null);
    const named = location && call && /\bteams\b/i.test(location) && !/^https?:/i.test(location);
    const place = (named ? call : (location ?? call)) || null;
    return {
      method,
      uid,
      sequence: Math.max(0, Math.floor(Number(get('SEQUENCE')?.value.trim() ?? 0) || 0)),
      summary: textOf('SUMMARY'),
      description: textOf('DESCRIPTION'),
      place: place && place.length <= PLACE_MAX ? place : null,
      start: at,
      end: new Date(Math.max(endMs, at.getTime())),
      hasTime: start?.hasTime ?? false,
      organizer: organizerEmail
        ? { email: organizerEmail, name: (organizer?.params.CN ?? '').trim() }
        : null,
      attendees: ev
        .filter((x) => x.name === 'ATTENDEE')
        .map(mailtoOf)
        .filter((x): x is string => x !== null),
    };
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** A description some calendars write as HTML (Google's, when it has formatting), as lines. */
function htmlText(html: string): string {
  return html
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const words = label.replace(/<[^>]*>/g, '').trim();
      return !words || words === href ? href : `${words} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole;
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? Number.parseInt(code.slice(2), 16)
          : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    });
}

/** The words of an invitation's description a person reads at most, as a message carries them. */
const WORDS_MAX = 10_000;

/**
 * What an invitation's organizer wrote of it, for a person to read: the part above the block
 * their calendar adds for its call (Google's `-::~:~::` lines, Outlook's and Teams' line of
 * underscores) and below Outlook's own heading of its time (`*~*~*~`), as text. Null when only
 * their calendar's own lines were there.
 */
export function invitationWords(description: string | null): string | null {
  if (!description) return null;
  let text = /<(br|p|div|a|li|ul|ol|b|i|strong|em|span)\b/i.test(description)
    ? htmlText(description)
    : description;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const heading = lines.findIndex((l) => /^\s*\*~\*~\*~/.test(l));
  const body = heading >= 0 ? lines.slice(heading + 1) : lines;
  const block = body.findIndex((l) => /^\s*-::~:~::/.test(l) || /^\s*_{20,}\s*$/.test(l));
  text = (block >= 0 ? body.slice(0, block) : body)
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text ? [...text].slice(0, WORDS_MAX).join('') : null;
}

/**
 * An attendee's answer to an invitation (`METHOD:REPLY`, RFC 5546 §3.2.3), as their calendar
 * app would send it: the organizer's event by its id and sequence, this attendee alone, and
 * their answer.
 */
export function buildReply(r: {
  uid: string;
  sequence: number;
  now: Date;
  start: Date;
  end: Date;
  summary: string;
  organizer: IcsPerson;
  attendee: IcsPerson;
  answer: 'ACCEPTED' | 'DECLINED';
}): string {
  if (!safeEmail(r.organizer.email) || !safeEmail(r.attendee.email))
    throw new Error('A reply needs real addresses');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Caime//Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REPLY',
    'BEGIN:VEVENT',
    `UID:${icsText(r.uid)}`,
    `SEQUENCE:${Math.max(0, Math.floor(r.sequence))}`,
    `DTSTAMP:${utc(r.now)}`,
    `DTSTART:${utc(r.start)}`,
    `DTEND:${utc(r.end > r.start ? r.end : r.start)}`,
    `SUMMARY:${icsText(r.summary)}`,
    `ORGANIZER;CN=${param(r.organizer.name)}:mailto:${r.organizer.email}`,
    `ATTENDEE;CN=${param(r.attendee.name)};PARTSTAT=${r.answer}:mailto:${r.attendee.email}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
