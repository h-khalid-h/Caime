/**
 * A Telegram chat export (M18 J6), read on the device that chose it, into the same shape a
 * WhatsApp export is read into (`whatsapp.ts`), so one sheet and one import route take both.
 * Telegram Desktop's "Export chat history" as JSON writes one `result.json`:
 *
 *   { "name": "Noor Haddad", "type": "personal_chat", "id": 123, "messages": [
 *     { "id": 1, "type": "message", "date": "2024-03-12T14:05:07", "from": "Noor Haddad",
 *       "from_id": "user123", "text": "On my way" },
 *     { "id": 2, "type": "message", "date": "…", "from": "Alex Chen",
 *       "text": ["Call me at ", { "type": "phone", "text": "+20 100 000 0000" }] },
 *     { "id": 3, "type": "message", "date": "…", "from": "Alex Chen", "photo": "photos/1.jpg",
 *       "text": "" },
 *     { "id": 4, "type": "service", "date": "…", "actor": "Noor Haddad", "action": "pin_message" }
 *   ] }
 *
 * A message's words are its `text`, one string or pieces (plain strings and marked spans, a
 * link, a mention, bold, each with its `text`); a photo, a file, a voice note or a sticker
 * isn't in the file as bytes, so it's counted as media left out, its caption kept; a "service"
 * line (someone joined, a pin) is Telegram's own. Dates are the exporting computer's local
 * time without a zone, read as the phone's are for WhatsApp. An account's whole export
 * (`chats.list`) is read when it holds one chat; anything else isn't a chat.
 *
 * Pure: no zod, no platform APIs, so the app takes it by subpath and the server checks with it.
 */

import { IMPORT_MAX_TEXT } from './imports';
import type { ImportedChat, ImportedMessage } from './whatsapp';

interface Piece {
  text?: unknown;
}

interface Entry {
  type?: unknown;
  date?: unknown;
  from?: unknown;
  text?: unknown;
  photo?: unknown;
  file?: unknown;
  media_type?: unknown;
  location_information?: unknown;
  poll?: unknown;
  contact_information?: unknown;
}

/** "2024-03-12T14:05:07", the exporting computer's clock. */
const DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

function dateOf(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = DATE.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const at = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    s ? Number(s) : 0,
  );
  return Number.isNaN(at.getTime()) ? null : at;
}

/** The words of a message: one string, or its pieces joined as they read. */
function wordsOf(text: unknown): string {
  if (typeof text === 'string') return text;
  if (!Array.isArray(text)) return '';
  return text
    .map((p: unknown) =>
      typeof p === 'string' ? p : typeof (p as Piece)?.text === 'string' ? (p as Piece).text : '',
    )
    .join('');
}

const hasMedia = (e: Entry): boolean =>
  Boolean(
    e.photo || e.file || e.media_type || e.location_information || e.poll || e.contact_information,
  );

/** The one chat in the file, or null when it isn't a Telegram export of one. */
function chatIn(parsed: unknown): { messages: unknown[] } | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as { messages?: unknown; chats?: { list?: unknown } };
  if (Array.isArray(o.messages)) return { messages: o.messages };
  const list = o.chats?.list;
  if (Array.isArray(list) && list.length === 1) return chatIn(list[0]);
  return null;
}

/** Read an export; null when the text isn't one. */
export function parseTelegram(text: string): ImportedChat | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const chat = chatIn(parsed);
  if (!chat) return null;
  const messages: ImportedMessage[] = [];
  const counts = new Map<string, number>();
  let system = 0;
  let mediaOmitted = 0;
  let skipped = 0;
  for (const raw of chat.messages) {
    const e = (raw ?? {}) as Entry;
    if (e.type === 'service') {
      system++;
      continue;
    }
    const at = dateOf(e.date);
    const author = typeof e.from === 'string' ? e.from.trim() : '';
    if (e.type !== 'message' || !at || !author) {
      skipped++;
      continue;
    }
    if (hasMedia(e)) mediaOmitted++;
    let body = wordsOf(e.text).replace(/\s+$/, '');
    if (body.length > IMPORT_MAX_TEXT) body = body.slice(0, IMPORT_MAX_TEXT);
    if (!body) continue;
    messages.push({ at, author, text: body });
    counts.set(author, (counts.get(author) ?? 0) + 1);
  }
  const authors = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([name]) => name);
  return { messages, authors, system, mediaOmitted, dayFirst: true, ambiguous: false, skipped };
}

/** Whether a file someone picked looks like Telegram's export rather than WhatsApp's text. */
export const looksLikeTelegram = (text: string): boolean => /^\s*\{/.test(text);
