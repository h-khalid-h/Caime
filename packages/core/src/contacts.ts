/**
 * A contacts file into People (R79): what Google Contacts, iCloud and Outlook export, read on
 * the device that chose it. iCloud and Android write vCard (2.1, 3.0 or 4.0: one card per
 * person, folded lines, a 2.1 card's quoted-printable names, a photo's base64); Google and
 * Outlook write CSV (a header naming each column, Google's "E-mail 1 - Value", Outlook's
 * "E-mail Address", a semicolon where the locale's Excel wants one). What comes out is the
 * same: a name and the addresses, nothing else, and only the addresses go to the server, to
 * find who's here. Nothing of the file is kept anywhere.
 *
 * Pure: no zod, no platform APIs, so the app takes it by subpath.
 */

export interface Contact {
  name: string | null;
  /** Lower-cased, unique, in the file's order. */
  emails: string[];
  /** Digits with a leading plus where there was one. */
  phones: string[];
}

export interface ContactsFile {
  format: 'vcard' | 'csv' | null;
  /** The people in it with a name, an address or a number; the rest say nothing. */
  contacts: Contact[];
  /** How many cards or rows the file held, before `CONTACTS_MAX` cut it. */
  read: number;
}

/** A file bigger than this is read to here: a phone book, not a database. */
export const CONTACTS_MAX = 5000;
/** How many addresses the server is asked about at a time (`POST /people/match`). */
export const CONTACTS_MATCH_MAX = 500;
/** A file bigger than this (bytes of text) isn't read at all. */
export const CONTACTS_TEXT_MAX = 20_000_000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseContacts(text: string): ContactsFile {
  if (text.length > CONTACTS_TEXT_MAX) return { format: null, contacts: [], read: 0 };
  const body = text.replace(/^﻿/, '');
  const head = body.trimStart().slice(0, 12).toUpperCase();
  if (head.startsWith('BEGIN:VCARD')) return parseVCards(body);
  if (looksLikeCsv(body)) return parseCsv(body);
  return { format: null, contacts: [], read: 0 };
}

/** Every address in the file, once, lower-cased, in order: what the server is asked about. */
export function emailsOf(file: ContactsFile): string[] {
  const seen = new Set<string>();
  for (const c of file.contacts) for (const e of c.emails) seen.add(e);
  return [...seen];
}

// --- vCard --------------------------------------------------------------------------------------

interface Property {
  name: string;
  params: Map<string, string[]>;
  value: string;
}

/** The lines of a vCard file, unfolded (RFC 6350 §3.2: a line starting with a space continues). */
function logicalLines(body: string): string[] {
  const raw = body.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length)
      lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

/** `NAME;PARAM=A,B;OTHER:value` (a group prefix, `item1.EMAIL`, dropped), or null for junk. */
function property(line: string): Property | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(';');
  let name = (parts[0] ?? '').trim().toUpperCase();
  const dot = name.lastIndexOf('.');
  if (dot >= 0) name = name.slice(dot + 1);
  if (!/^[A-Z0-9-]+$/.test(name)) return null;
  const params = new Map<string, string[]>();
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    // vCard 2.1 writes a bare value ("INTERNET", "QUOTED-PRINTABLE") where 3.0 writes TYPE=.
    const key = (eq >= 0 ? p.slice(0, eq) : 'TYPE').trim().toUpperCase();
    const vals = (eq >= 0 ? p.slice(eq + 1) : p)
      .split(',')
      .map((v) => v.trim().replace(/^"|"$/g, '').toUpperCase())
      .filter(Boolean);
    params.set(key, [...(params.get(key) ?? []), ...vals]);
  }
  return { name, params, value };
}

const isQuotedPrintable = (p: Property) =>
  (p.params.get('ENCODING') ?? []).includes('QUOTED-PRINTABLE') ||
  (p.params.get('TYPE') ?? []).includes('QUOTED-PRINTABLE');

/** Quoted-printable (vCard 2.1), decoded as UTF-8; a byte that isn't text stays as it was. */
function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  const text = value.replace(/=\r?\n/g, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      for (const b of new TextEncoder().encode(ch)) bytes.push(b);
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes));
  } catch {
    return value;
  }
}

/** `\,` `\;` `\n` `\\` as written (RFC 6350 §3.4). */
const unescaped = (v: string) =>
  v.replace(/\\([\\,;nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

function parseVCards(body: string): ContactsFile {
  const contacts: Contact[] = [];
  let read = 0;
  let current: { fn: string | null; n: string | null; org: string | null; c: Contact } | null =
    null;
  const lines = logicalLines(body);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      current = { fn: null, n: null, org: null, c: { name: null, emails: [], phones: [] } };
      continue;
    }
    if (upper === 'END:VCARD') {
      if (current) {
        read++;
        const c = current.c;
        c.name = current.fn ?? current.n ?? current.org;
        if (c.name || c.emails.length || c.phones.length) contacts.push(c);
        if (contacts.length >= CONTACTS_MAX) break;
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const p = property(line);
    if (!p) continue;
    let value = p.value;
    if (isQuotedPrintable(p)) {
      // A 2.1 soft break is "=" at the end of the line, continued on the next raw line.
      while (value.endsWith('=') && i + 1 < lines.length) {
        i++;
        value = value.slice(0, -1) + (lines[i] as string);
      }
      value = decodeQuotedPrintable(value);
    }
    switch (p.name) {
      case 'FN':
        current.fn = unescaped(value).trim() || null;
        break;
      case 'N': {
        // family;given;additional;prefix;suffix: said as "given additional family".
        const parts = value.split(';').map((x) => unescaped(x).trim());
        const said = [parts[1], parts[2], parts[0]].filter(Boolean).join(' ');
        current.n = said || null;
        break;
      }
      case 'ORG':
        current.org = unescaped(value.split(';')[0] ?? '').trim() || null;
        break;
      case 'EMAIL': {
        const e = value.trim().toLowerCase();
        if (EMAIL.test(e) && !current.c.emails.includes(e)) current.c.emails.push(e);
        break;
      }
      case 'TEL': {
        const t = phoneOf(value.replace(/^tel:/i, ''));
        if (t && !current.c.phones.includes(t)) current.c.phones.push(t);
        break;
      }
    }
  }
  return { format: 'vcard', contacts, read };
}

/** An address as Caime compares it: trimmed, lower-cased; null when it isn't one. */
export function cleanEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? '').trim().toLowerCase();
  return EMAIL.test(e) ? e : null;
}

/** A number as Caime keeps one; null under six digits (`phoneOf`). */
export function cleanPhone(raw: string | null | undefined): string | null {
  return raw ? phoneOf(raw.replace(/^tel:/i, '')) : null;
}

/** Digits with a leading plus: "+961 3 123 456" and "(03) 123-456" alike; null under six digits. */
function phoneOf(raw: string): string | null {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') || trimmed.startsWith('00');
  const digits = trimmed.replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 6 || digits.length > 20) return null;
  return plus ? `+${digits}` : digits;
}

// --- CSV ----------------------------------------------------------------------------------------

function looksLikeCsv(body: string): boolean {
  const first = body.split(/\r\n|\n|\r/, 1)[0] ?? '';
  return /[,;\t]/.test(first) && /name|e-?mail|phone|mobile|tel/i.test(first);
}

/** The delimiter is whichever the header line has most of, outside quotes. */
function delimiterOf(header: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
}

/** RFC 4180: quotes, doubled quotes inside them, newlines inside them. */
function rows(body: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

function parseCsv(body: string): ContactsFile {
  const lines = body.split(/\r\n|\n|\r/);
  const delimiter = delimiterOf(lines[0] ?? '');
  const table = rows(body, delimiter);
  const header = (table[0] ?? []).map(norm);
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const whole = find('name', 'full name', 'display name');
  const given = find('first name', 'given name');
  const middle = find('middle name', 'additional name');
  const family = find('last name', 'family name', 'surname');
  const company = find('organization name', 'organisation name', 'company', 'organization');
  const emails = header
    .map((h, i) => (/\be-?mail\b/.test(h) && !/type|label|display/.test(h) ? i : -1))
    .filter((i) => i >= 0);
  const phones = header
    .map((h, i) => (/phone|mobile|\btel\b/.test(h) && !/type|label/.test(h) ? i : -1))
    .filter((i) => i >= 0);
  const contacts: Contact[] = [];
  let read = 0;
  for (const row of table.slice(1)) {
    if (row.every((c) => !c.trim())) continue;
    read++;
    const at = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
    const name =
      at(whole) ||
      [at(given), at(middle), at(family)].filter(Boolean).join(' ') ||
      at(company) ||
      null;
    const c: Contact = { name, emails: [], phones: [] };
    // Google writes several in one cell, " ::: " between them.
    for (const i of emails)
      for (const part of at(i).split(/\s*:::\s*/)) {
        const e = part.trim().toLowerCase();
        if (EMAIL.test(e) && !c.emails.includes(e)) c.emails.push(e);
      }
    for (const i of phones)
      for (const part of at(i).split(/\s*:::\s*/)) {
        const t = phoneOf(part);
        if (t && !c.phones.includes(t)) c.phones.push(t);
      }
    if (c.name || c.emails.length || c.phones.length) contacts.push(c);
    if (contacts.length >= CONTACTS_MAX) break;
  }
  return { format: 'csv', contacts, read };
}
