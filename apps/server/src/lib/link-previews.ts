/**
 * Link previews (M16 E4c): the page behind the first link of a text, read once by the server and
 * kept by the SHA-256 of its address for thirty days (`link_previews`), so a link sent to a
 * hundred people, or a thousand times, is asked for once. The reader's device never asks the
 * site for anything: the card's words come with the message and its picture from Caime
 * (`/v1/links/:id/image`), so a site learns only that Caime's server opened the link, never who
 * sent it or who read it. Never in a private conversation (the server never sees its words),
 * never for mail (a link in mail may be how its sender learns it was opened), never for a link
 * the safety reading found suspicious, and never once its sender took the card off.
 *
 * Every request goes only where a webhook may (`safeLookup`): http or https on their own ports,
 * no private or loopback address in the name or in any answer for it, each redirect checked
 * again, three at most, one deadline for the whole exchange, and only the start of a page read
 * (to the end of its head, 512 KB at most) or a picture's first 5 MB. The picture is decoded
 * under the image semaphore with the pixel cap and kept as Caime's own small WebP, none of the
 * original's metadata with it.
 */
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { truncate } from '@caime/core/format';
import sharp from 'sharp';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import { isPrivateAddress, safeLookup } from './apps';
import { languageOf } from './i18n';
import { enqueue, registerJob } from './jobs';
import { PREVIEW_COLUMNS, type PreviewRow, previewedLink, previewIdOf } from './link-preview-views';
import { messageViews, participantsOf } from './messages';
import { IMAGE_PIXELS_MAX, images } from './renditions';
import { KEPT_DAYS } from './retention';

export const LINK_PREVIEW_JOB = 'links.preview';

/** A page gets this long, its redirects and its head included; its picture as long again. */
const DEADLINE_MS = 6_000;
const PAGE_MAX_BYTES = 512 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const REDIRECTS_MAX = 3;
/** The card's picture: across a bubble (320 points) on a 3x screen. */
const IMAGE_EDGE = 960;
/** Smaller than this either way, a picture is an icon or a tracking pixel, not a card's. */
const IMAGE_MIN = 64;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 300;
const SITE_MAX = 80;
/** Pages one person's messages may have read in ten minutes, on an instance. */
const READS_PER_SENDER = 60;

/** A kept preview with what says whether it's a card. */
export type KeptPreview = PreviewRow & { status: 'ready' | 'none' };

/** The address isn't one the server may ask for (or a redirect led to one). */
class Refused extends Error {}

/** The URL the server may ask for `raw` at, or null: http(s), no password, nothing private. */
export function linkTarget(raw: string, allowPrivate: boolean): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (allowPrivate) return url;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '')
    .toLowerCase();
  if (isIP(host)) return isPrivateAddress(host) ? null : url;
  // A bare name ("intranet") or a local one only means something inside a network.
  if (!host.includes('.')) return null;
  if (/(^|\.)(localhost|local|internal|lan|intranet|corp|home\.arpa)$/.test(host)) return null;
  return url;
}

function open(
  url: URL,
  headers: Record<string, string>,
  allowPrivate: boolean,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      url,
      { method: 'GET', headers, lookup: safeLookup(allowPrivate), signal },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * The body as it's read, never past `max` (decompressed, so a small bomb is cut short too), and
 * no further than the end of the head where that's all that's wanted. `whole` says it all came.
 */
async function readCapped(
  res: IncomingMessage,
  max: number,
  headOnly: boolean,
): Promise<{ body: Buffer; whole: boolean }> {
  const coding = String(res.headers['content-encoding'] ?? '')
    .trim()
    .toLowerCase();
  const decoder =
    coding === 'gzip' || coding === 'x-gzip'
      ? createGunzip()
      : coding === 'deflate'
        ? createInflate()
        : coding === 'br'
          ? createBrotliDecompress()
          : null;
  if (decoder) res.on('error', (err) => decoder.destroy(err));
  const stream = decoder ? res.pipe(decoder) : res;
  const chunks: Buffer[] = [];
  let size = 0;
  let tail = '';
  try {
    for await (const chunk of stream) {
      const b = chunk as Buffer;
      chunks.push(b);
      size += b.length;
      if (size >= max) return { body: Buffer.concat(chunks).subarray(0, max), whole: false };
      if (headOnly) {
        const seen = tail + b.toString('latin1');
        if (/<\/head\s*>/i.test(seen)) return { body: Buffer.concat(chunks), whole: false };
        tail = seen.slice(-16);
      }
    }
    return { body: Buffer.concat(chunks), whole: true };
  } finally {
    res.destroy();
    decoder?.destroy();
  }
}

interface Fetched {
  url: URL;
  status: number;
  type: string;
  body: Buffer;
  whole: boolean;
}

/** One GET, its redirects followed by hand (each checked again), within `signal`'s deadline. */
async function fetchLimited(
  start: URL,
  opts: {
    accept: string;
    language: string;
    userAgent: string;
    max: number;
    headOnly: boolean;
    allowPrivate: boolean;
    signal: AbortSignal;
  },
): Promise<Fetched> {
  const headers = {
    accept: opts.accept,
    'accept-language': `${opts.language},en;q=0.5`,
    'accept-encoding': 'gzip, deflate, br',
    'user-agent': opts.userAgent,
  };
  let url = start;
  for (let hop = 0; ; hop++) {
    const res = await open(url, headers, opts.allowPrivate, opts.signal);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      res.destroy();
      if (hop >= REDIRECTS_MAX) throw new Error('Too many redirects');
      let next: URL | null = null;
      try {
        next = linkTarget(new URL(location, url).toString(), opts.allowPrivate);
      } catch {
        next = null;
      }
      if (!next) throw new Refused();
      url = next;
      continue;
    }
    const type = String(res.headers['content-type'] ?? '').toLowerCase();
    const { body, whole } = await readCapped(res, opts.max, opts.headOnly);
    return { url, status, type, body, whole };
  }
}

const CHARSET = /charset\s*=\s*["']?([\w.:-]+)/i;

/** A page's bytes as text, in the charset its answer or its head names (UTF-8 otherwise). */
export function decodePage(body: Buffer, type: string): string {
  const head = body.toString('latin1', 0, Math.min(body.length, 8192));
  const label =
    CHARSET.exec(type)?.[1] ?? /<meta\b[^>]*charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1];
  try {
    return new TextDecoder(label ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

/** The entities a page's head writes most; any other named one stays as written. */
const NAMED: Record<string, string> = {
  amp: '&',
  AMP: '&',
  lt: '<',
  LT: '<',
  gt: '>',
  GT: '>',
  quot: '"',
  QUOT: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  auml: 'ä',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  oacute: 'ó',
  ocirc: 'ô',
  ouml: 'ö',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  szlig: 'ß',
  Eacute: 'É',
  Ccedil: 'Ç',
  Ouml: 'Ö',
  Uuml: 'Ü',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X'
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      const valid =
        Number.isFinite(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : all;
    }
    return NAMED[name] ?? all;
  });
}

/** Words as a card shows them: entities read, controls out, spaces as one; null if none. */
function clean(text: string | undefined): string | null {
  if (text === undefined) return null;
  const words = decodeEntities(text)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: controls are what's taken out
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return words || null;
}

const cut = (text: string | null, max: number) => (text ? truncate(text, max) : null);

const ATTR = /([^\s"'<>/=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const inner = tag.replace(/^<\s*[\w:-]+/, '').replace(/\/?>$/, '');
  for (const m of inner.matchAll(ATTR)) {
    const name = (m[1] ?? '').toLowerCase();
    if (name && !(name in out)) out[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

function absolute(src: string, base: URL): string | null {
  try {
    const url = new URL(src, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** What a page says of itself, read from its head's tags. */
export interface PageFacts {
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: string | null;
}

/** A page's Open Graph and Twitter tags, else its title and description; its picture's address. */
export function readPage(html: string, base: URL): PageFacts {
  // Comments, scripts and styles may hold text that looks like tags.
  const page = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  const meta = new Map<string, string>();
  for (const m of page.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? '').trim().toLowerCase();
    if (key && a.content !== undefined && !meta.has(key)) meta.set(key, a.content);
  }
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = clean(meta.get(key));
      if (value) return value;
    }
    return null;
  };
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(page)?.[1];
  const imageSrc = [...page.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => attrsOf(m[0]))
    .find((a) => (a.rel ?? '').toLowerCase().split(/\s+/).includes('image_src'))?.href;
  const image =
    pick('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src') ??
    clean(imageSrc);
  return {
    title: cut(pick('og:title', 'twitter:title') ?? clean(title), TITLE_MAX),
    description: cut(pick('og:description', 'twitter:description', 'description'), DESCRIPTION_MAX),
    siteName: cut(pick('og:site_name', 'application-name'), SITE_MAX),
    image: image ? absolute(image, base) : null,
  };
}

const userAgentOf = (ctx: AppContext) =>
  `Mozilla/5.0 (compatible; Caime/1.0; link preview; +${ctx.config.PUBLIC_URL})`;

/** A page's picture as Caime keeps it, or null: not a picture, too small, too big, unreadable. */
async function readPicture(
  ctx: AppContext,
  src: string,
  language: string,
): Promise<{ bytes: Buffer; width: number; height: number } | null> {
  const allowPrivate = ctx.config.LINK_PREVIEWS_ALLOW_PRIVATE;
  const target = linkTarget(src, allowPrivate);
  if (!target) return null;
  const got = await fetchLimited(target, {
    accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8',
    language,
    userAgent: userAgentOf(ctx),
    max: IMAGE_MAX_BYTES,
    headOnly: false,
    allowPrivate,
    signal: AbortSignal.timeout(DEADLINE_MS),
  });
  // Never a drawing (SVG), and never one cut short.
  if (got.status !== 200 || !got.whole || !/^image\/(png|jpe?g|gif|webp|avif)\b/.test(got.type))
    return null;
  return images.run(async () => {
    const meta = await sharp(got.body, { limitInputPixels: IMAGE_PIXELS_MAX }).metadata();
    if (!meta.width || !meta.height || meta.width < IMAGE_MIN || meta.height < IMAGE_MIN)
      return null;
    const { data, info } = await sharp(got.body, { limitInputPixels: IMAGE_PIXELS_MAX })
      .rotate()
      .resize({ width: IMAGE_EDGE, height: IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height };
  });
}

/** What a page says, or 'none' when it isn't a page or says nothing; throws to try again later. */
async function readLink(
  ctx: AppContext,
  target: URL,
  language: string,
): Promise<{ facts: PageFacts; picture: Awaited<ReturnType<typeof readPicture>> } | 'none'> {
  const page = await fetchLimited(target, {
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
    language,
    userAgent: userAgentOf(ctx),
    max: PAGE_MAX_BYTES,
    headOnly: true,
    allowPrivate: ctx.config.LINK_PREVIEWS_ALLOW_PRIVATE,
    signal: AbortSignal.timeout(DEADLINE_MS),
  });
  // Busy or down: nothing kept, so the next time it's sent it's asked again.
  if (page.status >= 500 || page.status === 408 || page.status === 429)
    throw new Error(`The page answered ${page.status}`);
  if (page.status !== 200 || !/^(text\/html|application\/xhtml\+xml)\b/.test(page.type))
    return 'none';
  const facts = readPage(decodePage(page.body, page.type), page.url);
  if (!facts.title && !facts.description) return 'none';
  const picture = facts.image
    ? await readPicture(ctx, facts.image, language).catch(() => null)
    : null;
  return { facts, picture };
}

const freshSince = (ctx: AppContext) =>
  new Date(ctx.now().getTime() - KEPT_DAYS.linkPreviews * 86_400_000);

/**
 * The page behind `url`, kept or read now: the kept one while it's fresh, else read and kept,
 * `ready` when it said something worth a card and `none` when it didn't. Null when it couldn't
 * be read this time (nothing is kept, so it's tried again), when `mayRead` says not now, or when
 * it isn't an address the server may ask for. `read` says it was read just now.
 */
export async function previewFor(
  ctx: AppContext,
  url: string,
  language: string,
  mayRead: () => boolean = () => true,
): Promise<{ row: KeptPreview; read: boolean } | null> {
  const id = previewIdOf(url);
  const kept = await ctx.db
    .selectFrom('link_previews')
    .select([...PREVIEW_COLUMNS, 'status', 'fetched_at'])
    .where('id', '=', id)
    .executeTakeFirst();
  if (kept && kept.fetched_at > freshSince(ctx)) {
    ctx.metrics.linkPreviews.inc({ outcome: 'kept' });
    return { row: kept, read: false };
  }
  const target = linkTarget(url, ctx.config.LINK_PREVIEWS_ALLOW_PRIVATE);
  if (!target || !mayRead()) {
    ctx.metrics.linkPreviews.inc({ outcome: 'refused' });
    return null;
  }
  let got: Awaited<ReturnType<typeof readLink>>;
  try {
    got = await readLink(ctx, target, language);
  } catch (err) {
    ctx.metrics.linkPreviews.inc({ outcome: err instanceof Refused ? 'refused' : 'failed' });
    return null;
  }
  const values = {
    status: got === 'none' ? ('none' as const) : ('ready' as const),
    title: got === 'none' ? null : got.facts.title,
    description: got === 'none' ? null : got.facts.description,
    site_name: got === 'none' ? null : got.facts.siteName,
    image: got === 'none' ? null : (got.picture?.bytes ?? null),
    image_width: got === 'none' ? null : (got.picture?.width ?? null),
    image_height: got === 'none' ? null : (got.picture?.height ?? null),
    fetched_at: ctx.now(),
  };
  await ctx.db
    .insertInto('link_previews')
    .values({ id, ...values })
    .onConflict((oc) => oc.column('id').doUpdateSet(values))
    .execute();
  ctx.metrics.linkPreviews.inc({ outcome: values.status === 'ready' ? 'read' : 'none' });
  return {
    row: {
      id,
      status: values.status,
      title: values.title,
      description: values.description,
      site_name: values.site_name,
      image_width: values.image_width,
      image_height: values.image_height,
    },
    read: true,
  };
}

/**
 * Queue a just-sent (or just-edited) text's link for its page, when this Caime reads pages and
 * the page isn't kept already: kept, the message's views carried its card from the start.
 */
export async function queueLinkPreview(ctx: AppContext, message: Message): Promise<void> {
  if (!ctx.config.LINK_PREVIEWS || !message.sender_id) return;
  const url = previewedLink(message);
  if (!url) return;
  const id = previewIdOf(url);
  const kept = await ctx.db
    .selectFrom('link_previews')
    .select('fetched_at')
    .where('id', '=', id)
    .executeTakeFirst();
  if (kept && kept.fetched_at > freshSince(ctx)) return;
  await enqueue(
    ctx,
    LINK_PREVIEW_JOB,
    { messageId: message.id, id },
    { dedupeKey: `${LINK_PREVIEW_JOB}:${message.id}:${id}`, maxAttempts: 2 },
  );
}

async function previewJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  if (!ctx.config.LINK_PREVIEWS) return;
  const messageId = String(payload.messageId ?? '');
  const m = messageId
    ? await ctx.db
        .selectFrom('messages')
        .select(MESSAGE_COLUMNS)
        .where('id', '=', messageId)
        .executeTakeFirst()
    : undefined;
  if (!m?.sender_id) return;
  const url = previewedLink(m);
  // Edited, deleted or taken off since: an edit queues its own.
  if (!url || previewIdOf(url) !== payload.id) return;
  const conversation = await ctx.db
    .selectFrom('conversations')
    .select(['privacy_class', 'notice'])
    .where('id', '=', m.conversation_id)
    .executeTakeFirst();
  if (!conversation || conversation.privacy_class === 'private' || conversation.notice) return;
  const sender = m.sender_id;
  const mayRead = () => {
    try {
      ctx.limiter.hit(`link-read:${sender}`, ctx.config.isTest ? 1000 : READS_PER_SENDER, 600_000);
      return true;
    } catch {
      return false;
    }
  };
  const got = await previewFor(ctx, url, await languageOf(ctx, sender), mayRead);
  if (!got?.read || got.row.status !== 'ready') return;
  // The card, to everyone in the conversation, as the transcript is: one view, as its sender
  // sees it (M16 D2a), masked for a customer by the bus.
  const members = (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id);
  const [view] = await messageViews(ctx.db, [m], sender);
  if (view?.link)
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
}

export function registerLinkPreviewJob(): void {
  registerJob(LINK_PREVIEW_JOB, previewJob);
}
