/**
 * A calendar feed as calendar apps read it (RFC 5545, PRD §72): Google Calendar, Outlook and
 * Apple Calendar subscribe to its address and show what's in it, and Caime stays the record of
 * it. Text is escaped so nothing in a title can start a line of its own, lines are folded at 75
 * octets without splitting a character, and every line ends in CRLF.
 */

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
