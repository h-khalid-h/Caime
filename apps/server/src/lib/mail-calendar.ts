/**
 * The calendar in a mail (R86, M16 F3): what a calendar app sends when someone answers an
 * invitation (`METHOD:REPLY`, RFC 6047). Gmail attaches it as a file, Outlook and Apple put it
 * in the message as one of its alternatives, which a provider may not hand over as an attachment:
 * so an attached `.ics` first, then a `text/calendar` part of the message as it arrived, decoded
 * from its transfer encoding, then the words themselves when they are a calendar. Never throws
 * on what came by mail.
 */
import type { InboundMail } from './mail-provider';

/** A calendar part longer than this is no answer to an invitation. */
const CALENDAR_MAX = 64 * 1024;
/** A raw message past this isn't read for one. */
const RAW_MAX = 30 * 1024 * 1024;

export function calendarOf(mail: InboundMail): string | null {
  const part = mail.attachments.find(
    (a) => a.mime.toLowerCase().startsWith('text/calendar') || /\.ics$/i.test(a.name),
  );
  if (part && part.bytes.length <= CALENDAR_MAX) return part.bytes.toString('utf8');
  const inRaw = mail.raw ? calendarPartOf(mail.raw) : null;
  if (inRaw) return inRaw;
  return mail.text.includes('BEGIN:VCALENDAR') ? mail.text.slice(0, CALENDAR_MAX) : null;
}

/**
 * A `text/calendar` part of a message as it arrived (RFC 2045): its headers back to the boundary
 * or the blank line before them, its body up to the next boundary, decoded. Null without one.
 */
export function calendarPartOf(raw: string): string | null {
  // Most mail carries no calendar: a scan that allocates nothing says so before any split.
  if (raw.length > RAW_MAX || !/content-type:\s*(text\/calendar|application\/ics)/i.test(raw))
    return null;
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^content-type:\s*(text\/calendar|application\/ics)\b/i.test(lines[i] ?? '')) continue;
    let start = i;
    while (start > 0 && lines[start - 1] !== '' && !lines[start - 1]?.startsWith('--')) start--;
    let end = i;
    while (end < lines.length && lines[end] !== '') end++;
    const headers = lines
      .slice(start, end)
      .join('\n')
      .replace(/\n[ \t]+/g, ' ');
    const encoding =
      /^content-transfer-encoding:\s*([\w-]+)/im.exec(headers)?.[1]?.toLowerCase() ?? '7bit';
    const body: string[] = [];
    for (let j = end + 1; j < lines.length && !lines[j]?.startsWith('--'); j++)
      body.push(lines[j] ?? '');
    const text = decoded(body, encoding);
    if (text.length <= CALENDAR_MAX && text.includes('BEGIN:VCALENDAR')) return text;
  }
  return null;
}

function decoded(lines: string[], encoding: string): string {
  if (encoding === 'base64')
    return Buffer.from(lines.join('').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64').toString('utf8');
  if (encoding === 'quoted-printable') {
    // Soft line breaks join, and each =XX is a byte of the UTF-8 it encodes (the rest is ASCII).
    const joined = lines.map((l) => (l.endsWith('=') ? l.slice(0, -1) : `${l}\r\n`)).join('');
    return Buffer.from(
      joined.replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      ),
      'latin1',
    ).toString('utf8');
  }
  return lines.join('\r\n');
}
