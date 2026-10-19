/**
 * A file read as a page (M16 H6): what a Word document, a workbook or a deck holds (its words and
 * tables, a workbook's sheets as tables, a deck's slides as their text), a list of values as a
 * table and plain words as they are, drawn by the server as plain HTML, so a browser shows what's
 * in one without a viewer of its own or a third party reading it (core `viewKindOf`,
 * `FileView.viewUrl`). The file itself stays a download away.
 *
 * Nothing in a file runs or is fetched: what's read is escaped into Caime's own few tags, a
 * formula is read as its last value, pictures and charts are left out. A file is read whole only
 * up to `VIEW_MAX_BYTES`; an Office file is a zip read here by its directory, each part asked for
 * inflated on the thread pool with a ceiling on what it may become (a zip that lies about its
 * sizes, or a bomb, stops there), and a page stops at so many paragraphs, rows, sheets or slides
 * and says so. Two are read at once on an instance, and a page read is kept ten minutes.
 */
import type { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { inflateRaw } from 'node:zlib';
import { formatBytes, VIEW_MAX_BYTES, type ViewKind } from '@caime/core';
import { msg, tr } from '@caime/core/i18n';
import { FACE, px, THEME_VARS, type } from './page-style';
import { Semaphore } from './semaphore';
import type { Storage } from './storage';
import { TtlCache } from './ttl-cache';

const inflate = promisify(inflateRaw) as (
  data: Buffer,
  opts: { maxOutputLength: number },
) => Promise<Buffer>;

/** The most one part of an Office file may become once inflated, and all of them together. */
const PART_MAX_BYTES = 16 * 1024 * 1024;
const PARTS_MAX_BYTES = 48 * 1024 * 1024;
/** How much a page shows: paragraphs, a sheet's rows and columns, sheets, slides, characters. */
const PARAGRAPHS_MAX = 3000;
const ROWS_MAX = 500;
const COLUMNS_MAX = 30;
const SHEETS_MAX = 10;
const SLIDES_MAX = 150;
const SHARED_STRINGS_MAX = 200_000;
const TEXT_CHARS_MAX = 300_000;
/** What of plain words or a list of values is read at all. */
const TEXT_BYTES_MAX = 2 * 1024 * 1024;
/** A page longer than this is cut where it reaches it. */
const PAGE_HTML_MAX = 1024 * 1024;

/** What a file holds, as the body of a page, and whether it was cut short. */
export interface ViewBody {
  html: string;
  cut: boolean;
}

/** Files read at once on an instance: reading is CPU and memory; the rest wait. */
export const views = new Semaphore(2);
const kept = new TtlCache<string, ViewBody | null>(16, 10 * 60_000);

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

// --- A zip, by its directory -------------------------------------------------------------------

interface ZipEntry {
  name: string;
  method: number;
  compressed: number;
  size: number;
  offset: number;
}

/** The entries a zip's central directory lists; null for anything that isn't a plain zip. */
function zipEntries(bytes: Buffer): ZipEntry[] | null {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) return null;
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  // A zip64 file says so with these at their highest; nothing read here is that large.
  if (count === 0xffff || at === 0xffffffff) return null;
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50) return null;
    const nameLength = bytes.readUInt16LE(at + 28);
    const extra = bytes.readUInt16LE(at + 30);
    const comment = bytes.readUInt16LE(at + 32);
    out.push({
      method: bytes.readUInt16LE(at + 10),
      compressed: bytes.readUInt32LE(at + 20),
      size: bytes.readUInt32LE(at + 24),
      offset: bytes.readUInt32LE(at + 42),
      name: bytes.toString('utf8', at + 46, at + 46 + nameLength),
    });
    at += 46 + nameLength + extra + comment;
  }
  return out;
}

/** One entry's bytes as they were before zipping, held to a ceiling whatever it says of itself. */
async function entryBytes(bytes: Buffer, e: ZipEntry, room: number): Promise<Buffer | null> {
  if (e.offset + 30 > bytes.length || bytes.readUInt32LE(e.offset) !== 0x04034b50) return null;
  const start =
    e.offset + 30 + bytes.readUInt16LE(e.offset + 26) + bytes.readUInt16LE(e.offset + 28);
  const data = bytes.subarray(start, start + e.compressed);
  if (data.length !== e.compressed) return null;
  const ceiling = Math.min(PART_MAX_BYTES, room);
  if (e.method === 0) return data.length <= ceiling ? data : null;
  if (e.method !== 8) return null;
  try {
    return await inflate(data, { maxOutputLength: ceiling });
  } catch {
    return null;
  }
}

/** The parts asked for, as text; a part that can't be read, or would be too large, is left out. */
async function zipParts(
  bytes: Buffer,
  wanted: (name: string) => boolean,
): Promise<Map<string, string> | null> {
  const entries = zipEntries(bytes);
  if (!entries) return null;
  const out = new Map<string, string>();
  let room = PARTS_MAX_BYTES;
  for (const e of entries) {
    if (!wanted(e.name) || room <= 0) continue;
    const data = await entryBytes(bytes, e, room);
    if (!data) continue;
    room -= data.length;
    out.set(e.name, data.toString('utf8'));
  }
  return out;
}

// --- XML, as Office writes it ------------------------------------------------------------------

type Token =
  | { type: 'open'; name: string; attrs: string; self: boolean }
  | { type: 'close'; name: string }
  | { type: 'text'; text: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function* tokens(xml: string): Generator<Token> {
  const re =
    /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<[?!][\s\S]*?>|([^<]+)/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[6] !== undefined) yield { type: 'text', text: decode(m[6]) };
    else if (m[5] !== undefined) yield { type: 'text', text: m[5] };
    else if (m[2] === undefined) continue;
    else if (m[1]) yield { type: 'close', name: m[2] };
    else yield { type: 'open', name: m[2], attrs: m[3] ?? '', self: Boolean(m[4]) };
  }
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(
    `(?:^|\\s)${name.replace(/[.:]/g, '\\$&')}\\s*=\\s*("([^"]*)"|'([^']*)')`,
  ).exec(attrs);
  return m ? decode(m[2] ?? m[3] ?? '') : null;
}

/** Where a part's relationships point: id to the path they name, resolved against `base`. */
function relations(xml: string | undefined, base: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!xml) return out;
  for (const t of tokens(xml)) {
    if (t.type !== 'open' || !t.name.endsWith('Relationship')) continue;
    const id = attr(t.attrs, 'Id');
    const target = attr(t.attrs, 'Target');
    if (!id || !target) continue;
    out.set(id, target.startsWith('/') ? target.slice(1) : normalise(`${base}/${target}`));
  }
  return out;
}

function normalise(path: string): string {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
}

// --- A document ----------------------------------------------------------------------------------

function documentBody(files: Map<string, string>): ViewBody {
  const xml = files.get('word/document.xml');
  if (!xml) return { html: '', cut: false };
  const out: string[] = [];
  let paragraphs = 0;
  let cut = false;
  // Tables nest: each open one holds its rows, a row its cells, a cell its paragraphs.
  const tables: string[][][][] = [];
  let para: { style: string | null; text: string } | null = null;
  for (const t of tokens(xml)) {
    if (paragraphs >= PARAGRAPHS_MAX) {
      cut = true;
      break;
    }
    if (t.type === 'open') {
      if (t.name === 'w:tbl') tables.push([]);
      else if (t.name === 'w:tr') tables.at(-1)?.push([]);
      else if (t.name === 'w:tc') tables.at(-1)?.at(-1)?.push([]);
      else if (t.name === 'w:p' && !t.self) para = { style: null, text: '' };
      else if (t.name === 'w:pStyle' && para) para.style = attr(t.attrs, 'w:val');
      else if ((t.name === 'w:tab' || t.name === 'w:ptab') && para) para.text += '\t';
      else if ((t.name === 'w:br' || t.name === 'w:cr') && para) para.text += '\n';
    } else if (t.type === 'close') {
      if (t.name === 'w:p' && para) {
        paragraphs += 1;
        const cell = tables.at(-1)?.at(-1)?.at(-1);
        if (cell) cell.push(escapeHtml(para.text));
        else if (para.text.trim()) {
          // A heading by its style's name (Word's own, in the languages it names them in), a
          // level under the page's own: the file's name is the page's one h1.
          const level = /^(?:heading|titre|başlık|berschrift)\s*([1-6])$/i.exec(
            para.style ?? '',
          )?.[1];
          const tag =
            para.style === 'Title' ? 'h2' : level ? `h${Math.min(6, Number(level) + 1)}` : 'p';
          out.push(`<${tag} dir="auto">${escapeHtml(para.text)}</${tag}>`);
        }
        para = null;
      } else if (t.name === 'w:tbl') {
        const rows = tables.pop() ?? [];
        const table = `<table>${rows
          .map((r) => `<tr>${r.map((c) => `<td dir="auto">${c.join('<br>')}</td>`).join('')}</tr>`)
          .join('')}</table>`;
        const cell = tables.at(-1)?.at(-1)?.at(-1);
        if (cell) cell.push(table);
        else out.push(table);
      }
    } else if (para && t.text) {
      para.text += t.text;
    }
  }
  return { html: out.join('\n'), cut };
}

// --- A workbook ----------------------------------------------------------------------------------

/** Excel's built-in formats that show a day. */
const DAY_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? '') n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const columnName = (i: number): string =>
  i < 26
    ? String.fromCharCode(65 + i)
    : columnName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));

/** A spreadsheet's day number as the day it is (the 1900 system Excel uses by default). */
function serialDay(serial: number): string {
  const at = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000));
  if (Number.isNaN(at.getTime())) return String(serial);
  return at
    .toISOString()
    .slice(0, serial % 1 ? 16 : 10)
    .replace('T', ' ');
}

function sharedStrings(xml: string | undefined): string[] {
  const out: string[] = [];
  if (!xml) return out;
  let current: string | null = null;
  let inText = false;
  for (const t of tokens(xml)) {
    if (t.type === 'open' && t.name === 'si') current = '';
    else if (t.type === 'open' && t.name === 't') inText = !t.self;
    else if (t.type === 'close' && t.name === 't') inText = false;
    else if (t.type === 'close' && t.name === 'si') {
      out.push(current ?? '');
      current = null;
      if (out.length >= SHARED_STRINGS_MAX) break;
    } else if (t.type === 'text' && inText && current !== null) current += t.text;
  }
  return out;
}

/** Which cell styles show a day: a built-in day format, or a format of its own written with days. */
function dayStyles(xml: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!xml) return out;
  const custom = new Map<number, boolean>();
  let inXfs = false;
  let xf = 0;
  for (const t of tokens(xml)) {
    if (t.type === 'open' && t.name === 'numFmt') {
      const code = (attr(t.attrs, 'formatCode') ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
      custom.set(Number(attr(t.attrs, 'numFmtId')), /[dy]/i.test(code));
    } else if (t.type === 'open' && t.name === 'cellXfs') inXfs = true;
    else if (t.type === 'close' && t.name === 'cellXfs') inXfs = false;
    else if (inXfs && t.type === 'open' && t.name === 'xf') {
      const id = Number(attr(t.attrs, 'numFmtId') ?? 0);
      if (DAY_FORMATS.has(id) || custom.get(id)) out.add(xf);
      xf += 1;
    }
  }
  return out;
}

/** Rows of cells as a table with the sheet's own letters and numbers at its edges. */
function sheetTable(rows: Map<number, Map<number, string>>, numbered: boolean): string {
  const width = Math.max(0, ...[...rows.values()].map((r) => Math.max(-1, ...r.keys()) + 1));
  if (!width) return '';
  const order = [...rows.keys()].sort((a, b) => a - b);
  const head = numbered
    ? `<tr><th></th>${Array.from({ length: width }, (_, i) => `<th>${columnName(i)}</th>`).join('')}</tr>`
    : '';
  const body = order
    .map(
      (n) =>
        `<tr>${numbered ? `<th>${n}</th>` : ''}${Array.from(
          { length: width },
          (_, i) => `<td dir="auto">${escapeHtml(rows.get(n)?.get(i) ?? '')}</td>`,
        ).join('')}</tr>`,
    )
    .join('');
  return `<div class="scroll"><table class="sheet">${head}${body}</table></div>`;
}

function workbookBody(files: Map<string, string>): ViewBody {
  const shared = sharedStrings(files.get('xl/sharedStrings.xml'));
  const days = dayStyles(files.get('xl/styles.xml'));
  const book = files.get('xl/workbook.xml');
  const rels = relations(files.get('xl/_rels/workbook.xml.rels'), 'xl');
  const sheets: Array<{ name: string; path: string }> = [];
  if (book)
    for (const t of tokens(book)) {
      if (t.type !== 'open' || t.name !== 'sheet') continue;
      const rid = attr(t.attrs, 'r:id');
      const path = rid ? rels.get(rid) : undefined;
      if (path) sheets.push({ name: attr(t.attrs, 'name') ?? path, path });
    }
  let cut = sheets.length > SHEETS_MAX;
  const out: string[] = [];
  for (const sheet of sheets.slice(0, SHEETS_MAX)) {
    const xml = files.get(sheet.path);
    if (!xml) continue;
    const rows = new Map<number, Map<number, string>>();
    let row = 0;
    let cell: { col: number; type: string | null; style: number; value: string } | null = null;
    let inValue = false;
    for (const t of tokens(xml)) {
      if (t.type === 'open' && t.name === 'row') {
        row = Number(attr(t.attrs, 'r') ?? row + 1);
        if (rows.size >= ROWS_MAX) {
          cut = true;
          break;
        }
      } else if (t.type === 'open' && t.name === 'c') {
        cell = t.self
          ? null
          : {
              col: columnIndex(attr(t.attrs, 'r') ?? 'A'),
              type: attr(t.attrs, 't'),
              style: Number(attr(t.attrs, 's') ?? 0),
              value: '',
            };
      } else if (t.type === 'open' && (t.name === 'v' || t.name === 't')) inValue = !t.self;
      else if (t.type === 'close' && (t.name === 'v' || t.name === 't')) inValue = false;
      else if (t.type === 'text' && inValue && cell) cell.value += t.text;
      else if (t.type === 'close' && t.name === 'c' && cell) {
        if (cell.col >= COLUMNS_MAX) cut = true;
        else if (cell.value !== '') {
          const v =
            cell.type === 's'
              ? (shared[Number(cell.value)] ?? '')
              : cell.type === 'b'
                ? cell.value === '1'
                  ? 'TRUE'
                  : 'FALSE'
                : !cell.type && days.has(cell.style) && Number.isFinite(Number(cell.value))
                  ? serialDay(Number(cell.value))
                  : cell.value;
          if (!rows.has(row)) rows.set(row, new Map());
          rows.get(row)?.set(cell.col, v);
        }
        cell = null;
      }
    }
    out.push(`<h2 dir="auto">${escapeHtml(sheet.name)}</h2>${sheetTable(rows, true)}`);
  }
  return { html: out.join('\n'), cut };
}

// --- A deck ------------------------------------------------------------------------------------

function deckBody(files: Map<string, string>): ViewBody {
  const deck = files.get('ppt/presentation.xml');
  const rels = relations(files.get('ppt/_rels/presentation.xml.rels'), 'ppt');
  const slides: string[] = [];
  if (deck)
    for (const t of tokens(deck)) {
      if (t.type !== 'open' || t.name !== 'p:sldId') continue;
      const rid = attr(t.attrs, 'r:id');
      const path = rid ? rels.get(rid) : undefined;
      if (path) slides.push(path);
    }
  const out: string[] = [];
  slides.slice(0, SLIDES_MAX).forEach((path, i) => {
    const xml = files.get(path);
    if (!xml) return;
    const lines: string[] = [];
    let line: string | null = null;
    let inText = false;
    for (const t of tokens(xml)) {
      if (t.type === 'open' && t.name === 'a:p') line = '';
      else if (t.type === 'open' && t.name === 'a:t') inText = !t.self;
      else if (t.type === 'close' && t.name === 'a:t') inText = false;
      else if (t.type === 'open' && t.name === 'a:br' && line !== null) line += '\n';
      else if (t.type === 'text' && inText && line !== null) line += t.text;
      else if (t.type === 'close' && t.name === 'a:p') {
        if (line?.trim()) lines.push(line);
        line = null;
      }
    }
    out.push(
      `<section class="slide"><h2>${escapeHtml(tr('Slide {number}', { number: i + 1 }))}</h2>${lines
        .map((l) => `<p dir="auto">${escapeHtml(l)}</p>`)
        .join('')}</section>`,
    );
  });
  return { html: out.join('\n'), cut: slides.length > SLIDES_MAX };
}

// --- Plain words and lists of values -----------------------------------------------------------

/** Words as they were written: UTF-8 (or UTF-16 by its mark), else the older Western encoding. */
function wordsOf(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** A list of values's rows, by the separator its first line uses most (`,`, `;` or a tab). */
function csvRows(text: string): { rows: string[][]; cut: boolean } {
  const first = text.slice(0, text.indexOf('\n') >>> 0);
  const count = (c: string) => first.split(c).length;
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0] ?? ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length >= ROWS_MAX * 2) return { rows, cut: i < text.length - 1 };
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return { rows, cut: false };
}

function csvBody(text: string, truncated: boolean): ViewBody {
  const { rows, cut } = csvRows(text);
  const cells = new Map<number, Map<number, string>>();
  let wide = false;
  rows.forEach((r, n) => {
    if (r.length > COLUMNS_MAX) wide = true;
    cells.set(n + 1, new Map(r.slice(0, COLUMNS_MAX).map((v, i) => [i, v] as const)));
  });
  return { html: sheetTable(cells, false), cut: cut || wide || truncated };
}

function textBody(text: string, truncated: boolean): ViewBody {
  const cut = truncated || text.length > TEXT_CHARS_MAX;
  return { html: `<pre dir="auto">${escapeHtml(text.slice(0, TEXT_CHARS_MAX))}</pre>`, cut };
}

// --- Reading one -------------------------------------------------------------------------------

async function bytesOf(source: Readable, max: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of source as AsyncIterable<Buffer>) {
    length += chunk.length;
    if (length > max) {
      source.destroy();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** What an Office file holds, from its bytes (exported for the tests). */
export async function officeBody(
  bytes: Buffer,
  kind: 'docx' | 'xlsx' | 'pptx',
): Promise<ViewBody | null> {
  if (kind === 'docx') {
    const files = await zipParts(bytes, (p) => p === 'word/document.xml');
    return files ? documentBody(files) : null;
  }
  if (kind === 'xlsx') {
    const files = await zipParts(
      bytes,
      (p) =>
        p === 'xl/workbook.xml' ||
        p === 'xl/_rels/workbook.xml.rels' ||
        p === 'xl/sharedStrings.xml' ||
        p === 'xl/styles.xml' ||
        /^xl\/worksheets\/sheet\d+\.xml$/.test(p),
    );
    return files ? workbookBody(files) : null;
  }
  const files = await zipParts(
    bytes,
    (p) =>
      p === 'ppt/presentation.xml' ||
      p === 'ppt/_rels/presentation.xml.rels' ||
      /^ppt\/slides\/slide\d+\.xml$/.test(p),
  );
  return files ? deckBody(files) : null;
}

/** What a list of values or plain words holds, from its first bytes. */
export function wordsBody(bytes: Buffer, kind: 'csv' | 'text', truncated: boolean): ViewBody {
  const text = wordsOf(bytes).replace(/^﻿/, '');
  return kind === 'csv' ? csvBody(text, truncated) : textBody(text, truncated);
}

/** A page's body held to its length: cut at the last tag that closed before it. */
function bounded(body: ViewBody): ViewBody {
  if (body.html.length <= PAGE_HTML_MAX) return body;
  const at = body.html.lastIndexOf('\n', PAGE_HTML_MAX);
  return { html: body.html.slice(0, at > 0 ? at : 0), cut: true };
}

/**
 * What a stored file holds, as the body of its page, or null when it can't be read (not the kind
 * it says, nothing in it, too large). Read once in ten minutes per file on an instance, two at a
 * time, in the words of whoever asks (a slide's heading is the reader's).
 */
export async function viewBodyOf(
  storage: Storage,
  file: { id: string; storage_key: string; size: string | number },
  kind: ViewKind,
  language: string,
): Promise<ViewBody | null> {
  const key = `${file.id}:${language}`;
  const hit = kept.get(key);
  if (hit !== undefined) return hit;
  const size = Number(file.size);
  if (size <= 0 || (kind !== 'csv' && kind !== 'text' && size > VIEW_MAX_BYTES)) return null;
  const body = await views.run(async () => {
    if (kind === 'csv' || kind === 'text') {
      const truncated = size > TEXT_BYTES_MAX;
      const bytes = await bytesOf(
        storage.read(file.storage_key, { start: 0, end: Math.min(size, TEXT_BYTES_MAX) - 1 }),
        TEXT_BYTES_MAX,
      );
      return bytes ? wordsBody(bytes, kind, truncated) : null;
    }
    const bytes = await bytesOf(storage.read(file.storage_key), VIEW_MAX_BYTES);
    return bytes ? officeBody(bytes, kind) : null;
  });
  const out = body?.html.trim() ? bounded(body) : null;
  kept.set(key, out);
  return out;
}

// --- The page ------------------------------------------------------------------------------------

/**
 * A file's page runs nothing and loads nothing but the shell's fonts: no script at all, no
 * picture from anywhere, no form, and no frame but Caime's own.
 */
export const VIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

/** What each kind is called on its page. */
export const VIEW_KIND_LABELS: Record<ViewKind, string> = {
  docx: msg('Document'),
  xlsx: msg('Spreadsheet'),
  pptx: msg('Presentation'),
  csv: msg('Table'),
  text: msg('Plain text'),
};

/**
 * How what a file holds is laid out, wherever it's shown (its own page, a link's page): the
 * tokens' type and colours, tables that scroll sideways on a phone rather than the page.
 */
export const VIEW_STYLE = `
.doc{${type('message')};color:var(--text);overflow-wrap:anywhere}
.doc h1,.doc h2,.doc h3,.doc h4,.doc h5,.doc h6{${type('headline')};color:var(--ink);margin:20px 0 8px}
.doc h1{${type('title')}}
.doc p{margin:0 0 10px;white-space:pre-wrap}
.doc pre{${type('message')};font-family:${FACE.body};white-space:pre-wrap;margin:0}
.doc .scroll{overflow-x:auto;margin:0 0 16px;border:1px solid var(--border);border-radius:${px.radius('md')}}
.doc table{border-collapse:collapse;${type('body')}}
.doc .scroll table{margin:0}
.doc td,.doc th{border:1px solid var(--border);padding:4px 8px;vertical-align:top;text-align:start;white-space:pre-wrap}
.doc th{background:var(--surface-muted);color:var(--text-secondary);${type('captionStrong')}}
.doc .slide{border:1px solid var(--border);border-radius:${px.radius('lg')};padding:12px 16px;margin:0 0 12px;background:var(--surface)}
.doc .slide h2{${type('captionStrong')};color:var(--text-tertiary);margin:0 0 6px}
.doc-cut{${type('caption')};color:var(--text-secondary);margin:16px 0 0}
`;

/** The line under a file's name: what it is and its size, in the reader's words. */
export const viewKindLine = (kind: ViewKind, size: number) =>
  `${tr(VIEW_KIND_LABELS[kind])} · ${formatBytes(size)}`;

/** What a file's page says in place of its contents when it can't be read. */
export const unreadableLine = () =>
  tr('This file can’t be shown as a page. Download it to open it.');
/** And under contents cut short. */
export const cutLine = () => tr('The page stops here: the rest is in the file.');

/**
 * A file's own page (`/v1/files/:id/view`): its name, what it is, a way to download it, and what
 * it holds, or a line saying it can't be shown. A document of its own, in the reader's words.
 */
export function viewPage(o: {
  name: string;
  kind: ViewKind;
  size: number;
  body: ViewBody | null;
  download: string;
  faces: string;
  lang: string;
  rtl: boolean;
}): string {
  return `<!doctype html>
<html lang="${escapeHtml(o.lang)}" dir="${o.rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(o.name)} · Caime</title>
${o.faces}
<style>
:root{color-scheme:light dark}
${THEME_VARS}
body{margin:0;font-family:${FACE.body};background:var(--canvas);color:var(--text)}
main{max-width:880px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;flex-direction:column;gap:6px;padding-bottom:16px;margin-bottom:20px;border-bottom:1px solid var(--border)}
header h1{${type('title')};color:var(--ink);margin:0}
.kind{${type('captionStrong')};color:var(--text-secondary);margin:0}
.note{${type('caption')};color:var(--text-secondary);margin:0}
.save{align-self:flex-start;display:inline-flex;align-items:center;min-height:${px.height('md')};padding:0 18px;border-radius:${px.radius('pill')};${type('label')};text-decoration:none;background:var(--primary);color:var(--on-primary)}
.save:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
${VIEW_STYLE}
</style>
</head>
<body>
<main>
<header>
<p class="kind">${escapeHtml(viewKindLine(o.kind, o.size))}</p>
<h1 dir="auto">${escapeHtml(o.name)}</h1>
<p class="note">${escapeHtml(o.body ? tr('What the file holds, as words and tables: its look, pictures and charts are in the file itself.') : unreadableLine())}</p>
<a class="save" href="${escapeHtml(o.download)}" download>${escapeHtml(tr('Download'))}</a>
</header>
${o.body ? `<article class="doc">${o.body.html}</article>${o.body.cut ? `<p class="doc-cut">${escapeHtml(cutLine())}</p>` : ''}` : ''}
</main>
</body>
</html>`;
}
