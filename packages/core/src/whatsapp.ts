/**
 * A WhatsApp chat export (R45), read on the device that chose it. "Export chat" writes one
 * text file, one line per message, in the phone's own language and date order:
 *
 *   Android   12/03/2024, 14:05 - Noor Haddad: On my way
 *   iOS       [12/03/2024, 14:05:07] Noor Haddad: On my way
 *   US        3/12/24, 2:05 PM - Noor Haddad: On my way
 *
 * A line that doesn't start with a date continues the message before it. A dated line with no
 * "Name: " is WhatsApp's own ("Messages and calls are end-to-end encrypted", "Noor added Alex").
 * Photos and files aren't in the text: they're "<Media omitted>" (Android) or "image omitted"
 * (iOS), counted here so the person is told what didn't come along. Nothing here is a fact
 * about anyone: what's imported says where it came from on every message (payload.imported).
 *
 * Pure: no zod, no platform APIs, so the app takes it by subpath and the server checks with it.
 */

import { IMPORT_MAX_TEXT } from './imports';

export interface ImportedMessage {
  /** When it was written, in the export's own clock (a phone's local time, no zone). */
  at: Date;
  author: string;
  text: string;
}

export interface WhatsAppChat {
  /** People's messages, in the file's order, media notes left out. */
  messages: ImportedMessage[];
  /** Who wrote, most messages first. Two names is a one-to-one chat. */
  authors: string[];
  /** WhatsApp's own lines (encryption notice, people added), not imported. */
  system: number;
  /** Photos, videos, voice notes and files the export left out. */
  mediaOmitted: number;
  /** Which date order the file was read in. */
  dayFirst: boolean;
  /** Every date in the file fits both orders (all days 12 or under): the reader had to guess. */
  ambiguous: boolean;
  /** Lines before the first dated one, or after a date the reader couldn't make sense of. */
  skipped: number;
}

// [date, time] then either " - " (Android) or "] " (iOS), then the rest of the line.
const HEADER =
  /^\[?(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])?\.?[Mm]?\.?\]?\s?(?:-\s)?(.*)$/;
const AUTHOR = /^([^:\n]{1,120}?):\s(.*)$/s;
const MEDIA =
  /^(?:<Media omitted>|<Médias omis>|<Medien ausgeschlossen>|<Archivo omitido>|<Multimédia omitido>|<Arquivo de mídia oculto>|<Media weggelaten>|<Media omessi>|<Медиафайл отсутствует>|<تم استبعاد الوسائط>|(?:image|video|audio|sticker|GIF|document|Contact card) omitted|<attached: .+>)$/i;

/** Direction and format marks phones leave in the file, and the narrow space iOS puts before AM. */
const MARKS = /[‎‏‪-‮⁦-⁩]/g;

interface Header {
  a: number;
  b: number;
  c: number;
  hour: number;
  minute: number;
  second: number;
  rest: string;
}

function header(line: string): Header | null {
  const m = HEADER.exec(line);
  if (!m) return null;
  let hour = Number(m[4]);
  const meridiem = m[7]?.toLowerCase();
  if (meridiem) {
    if (hour > 12) return null;
    hour = hour % 12;
    if (meridiem === 'p') hour += 12;
  } else if (hour > 23) return null;
  const minute = Number(m[5]);
  if (minute > 59) return null;
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    c: Number(m[3]),
    hour,
    minute,
    second: Number(m[6] ?? 0),
    rest: m[8] ?? '',
  };
}

function year(n: number): number {
  return n < 100 ? 2000 + n : n;
}

/**
 * Which of the first two numbers is the day. A year first (2024-03-12) is decided; else any
 * first number over 12 says day first, any second over 12 says month first. Neither is a guess,
 * and the person is asked (dayFirst is offered as a switch).
 */
function decideDayFirst(
  headers: Header[],
  asked?: boolean,
): { dayFirst: boolean; ambiguous: boolean } {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const h of headers) {
    if (h.a > 31) continue; // year first: read as y-m-d either way
    if (h.a > 12) dayFirst++;
    else if (h.b > 12) monthFirst++;
  }
  if (dayFirst && !monthFirst) return { dayFirst: true, ambiguous: false };
  if (monthFirst && !dayFirst) return { dayFirst: false, ambiguous: false };
  if (dayFirst && monthFirst) return { dayFirst: dayFirst >= monthFirst, ambiguous: false };
  return { dayFirst: asked ?? true, ambiguous: true };
}

function dateOf(h: Header, dayFirst: boolean): Date | null {
  let y: number;
  let mo: number;
  let d: number;
  if (h.a > 31) [y, mo, d] = [h.a, h.b, h.c];
  else if (dayFirst) [d, mo, y] = [h.a, h.b, year(h.c)];
  else [mo, d, y] = [h.a, h.b, year(h.c)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2009 || y > 2100) return null;
  const at = new Date(y, mo - 1, d, h.hour, h.minute, h.second);
  // The 31st of a month that has 30: rolled over, so not a date.
  if (at.getMonth() !== mo - 1) return null;
  return at;
}

/** Read an export. `dayFirst` is what the person chose when the file didn't say. */
export function parseWhatsApp(text: string, options: { dayFirst?: boolean } = {}): WhatsAppChat {
  const lines = text.replace(MARKS, '').replace(/ | /g, ' ').split(/\r?\n/);
  const headers: Header[] = [];
  const raw: Array<{ h: Header | null; line: string }> = [];
  for (const line of lines) {
    const h = header(line);
    if (h) headers.push(h);
    raw.push({ h, line });
  }
  const { dayFirst, ambiguous } = decideDayFirst(headers, options.dayFirst);

  const messages: ImportedMessage[] = [];
  const counts = new Map<string, number>();
  let system = 0;
  let mediaOmitted = 0;
  let skipped = 0;
  let current: ImportedMessage | 'system' | null = null;
  for (const { h, line } of raw) {
    if (!h) {
      // A blank line inside a message is part of it; anything before the first message isn't.
      if (current && current !== 'system') current.text += `\n${line}`;
      else if (current === null && line.trim()) skipped++;
      continue;
    }
    const at = dateOf(h, dayFirst);
    if (!at) {
      skipped++;
      current = null;
      continue;
    }
    const who = AUTHOR.exec(h.rest);
    if (!who) {
      system++;
      current = 'system';
      continue;
    }
    const author = (who[1] ?? '').trim();
    const body = who[2] ?? '';
    if (MEDIA.test(body.trim())) {
      mediaOmitted++;
      current = 'system';
      continue;
    }
    const message: ImportedMessage = { at, author, text: body };
    current = message;
    messages.push(message);
    counts.set(author, (counts.get(author) ?? 0) + 1);
  }
  for (const m of messages) {
    m.text = m.text.replace(/\s+$/, '');
    if (m.text.length > IMPORT_MAX_TEXT) m.text = m.text.slice(0, IMPORT_MAX_TEXT);
  }
  const kept = messages.filter((m) => m.text.length > 0);
  const authors = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([name]) => name);
  return { messages: kept, authors, system, mediaOmitted, dayFirst, ambiguous, skipped };
}

/** The other name in a one-to-one export, once the person has said which is theirs. */
export function otherAuthor(chat: WhatsAppChat, mine: string): string | null {
  const others = chat.authors.filter((a) => a !== mine);
  return others.length === 1 ? (others[0] ?? null) : null;
}
