/**
 * A message's link preview as people see it (M16 E4c): the first link of a text written in a
 * conversation that isn't private, unless its sender took the preview off, and never a link the
 * safety reading found suspicious (a card would make it look trusted). The preview is the page's
 * own words, read once on the server and kept by the link's address (`link-previews.ts`), never
 * by message or by person, so the view looks it up by the address alone, one query for a batch.
 */
import { createHash } from 'node:crypto';
import type { LinkPreviewView } from '@caime/core/api';
import type { Kysely, Transaction } from 'kysely';
import type { Database, Message } from '../db/schema';

type Q = Kysely<Database> | Transaction<Database>;

/** A preview's key: the SHA-256 of its address, which says nothing of who sent it. */
export const previewIdOf = (url: string) => createHash('sha256').update(url).digest('hex');

/** Where Caime serves its copy of a page's picture, so the reader's device never asks the site. */
export const linkImagePath = (id: string) => `/v1/links/${id}/image`;

/**
 * An address as it's read and kept: http(s), or one written from `www.` (as a message's links
 * are), without a fragment or a password; null for anything else.
 */
export function previewUrl(raw: string): string | null {
  const written = raw.trim();
  const full = /^https?:\/\//i.test(written)
    ? written
    : /^www\./i.test(written)
      ? `https://${written}`
      : null;
  if (!full) return null;
  try {
    const url = new URL(full);
    if (url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

type Linked = Pick<Message, 'kind' | 'sealed' | 'deleted_at' | 'payload' | 'entities' | 'channel'>;

/**
 * The address a message's preview is of, or null where it has none: not a text, sealed, gone,
 * mail (a link in mail may be the sender's way of knowing it was opened), taken off by its
 * sender, or a first link that's suspicious.
 */
export function previewedLink(m: Linked): string | null {
  if (m.kind !== 'text' || m.sealed || m.deleted_at || m.channel === 'mail') return null;
  if ((m.payload as { noPreview?: unknown } | null)?.noPreview === true) return null;
  const links = (m.entities as { links?: Array<{ url?: unknown; suspicious?: unknown }> } | null)
    ?.links;
  const first = Array.isArray(links) ? links[0] : undefined;
  if (!first || typeof first.url !== 'string' || first.suspicious === true) return null;
  return previewUrl(first.url);
}

/** A kept preview's columns, never its picture's bytes. */
export const PREVIEW_COLUMNS = [
  'id',
  'title',
  'description',
  'site_name',
  'image_width',
  'image_height',
] as const;

export interface PreviewRow {
  id: string;
  title: string | null;
  description: string | null;
  site_name: string | null;
  image_width: number | null;
  image_height: number | null;
}

/** A kept preview as a card for `url`, the address it's of (which only the message keeps). */
export function previewView(row: PreviewRow, url: string): LinkPreviewView {
  const pictured = row.image_width !== null && row.image_height !== null;
  return {
    url,
    title: row.title,
    description: row.description,
    siteName: row.site_name,
    imageUrl: pictured ? linkImagePath(row.id) : null,
    imageWidth: pictured ? row.image_width : null,
    imageHeight: pictured ? row.image_height : null,
  };
}

/** Each message's link to preview and its preview's id, for those that have one. */
export function previewIdsOf(
  rows: Array<Linked & { id: string }>,
): Map<string, { url: string; id: string }> {
  const ids = new Map<string, { url: string; id: string }>();
  for (const m of rows) {
    const url = previewedLink(m);
    if (url) ids.set(m.id, { url, id: previewIdOf(url) });
  }
  return ids;
}

/** The ready previews among `ids`, by their id: one query, whatever the batch. */
export async function readyPreviews(db: Q, ids: Iterable<string>): Promise<PreviewRow[]> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return [];
  return db
    .selectFrom('link_previews')
    .select(PREVIEW_COLUMNS)
    .where('id', 'in', wanted)
    .where('status', '=', 'ready')
    .execute();
}
