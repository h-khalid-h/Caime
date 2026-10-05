/**
 * A host's catalog as pages (R61): collections that group its items (a clinic's "Treatments"
 * and "Products", a guesthouse's "Rooms"), and an address for each public item and collection
 * under the host's own (`/o/<handle>/<slug>`, `/@<handle>/<slug>`), so a search or an answer
 * engine finds what's offered by name. One slug space per host: an item's and a collection's
 * never collide, and none is a word the host's own screens use. Pure, no zod: the app takes it
 * by subpath.
 */
import { type BookingAudience, type BookingItem, canBook } from './booking';
import type { Sphere } from './taxonomy';

export const COLLECTIONS_MAX = 20;
export const SLUG_MAX = 60;

/** A group of a host's items, with a page of its own when everyone may see it. */
export interface CatalogCollection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** Who sees it; an item in it is seen only by whom both allow. */
  audience: BookingAudience;
}

/**
 * Words a host's page already uses after its handle (`/o/<handle>/setup`), and the links' own
 * (`?book`, `?order`, `?pay`, `?write`): never an item's or a collection's address.
 */
export const RESERVED_SLUGS = [
  'setup',
  'inbox',
  'book',
  'order',
  'pay',
  'write',
  'edit',
  'new',
  'settings',
] as const;

/** Letters and digits of any script, lowercase, joined by single hyphens. */
export const SLUG_PATTERN = /^[\p{Ll}\p{Lo}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{N}]+)*$/u;

/**
 * "Hair oil (50 ml)" → "hair-oil-50-ml"; "Çay & Börek" → "cay-borek"; Arabic stays Arabic
 * ("قص الشعر" → "قص-الشعر"), as people search in it. Marks are dropped from Latin letters,
 * Turkish's dotless ı reads as i.
 */
export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^\p{Ll}\p{Lo}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return s;
}

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug);
}

/** Whether a slug may be used: the pattern, the length, not reserved. */
export function slugError(slug: string): 'empty' | 'shape' | 'reserved' | null {
  if (!slug) return 'empty';
  if (slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) return 'shape';
  if (isReservedSlug(slug)) return 'reserved';
  return null;
}

/**
 * Every item and collection with a slug of its own, unique across both: one kept as it was
 * when it's fine, else made from the name (then the id), with "-2", "-3" where taken. Run on
 * what's saved and on what's read, so an older catalog, kept before addresses, has them too.
 */
export function withSlugs<
  I extends { id: string; name: string; slug?: string | null },
  C extends { id: string; name: string; slug?: string | null },
>(items: readonly I[], collections: readonly C[]): { items: I[]; collections: C[] } {
  const taken = new Set<string>();
  const give = (thing: { id: string; name: string; slug?: string | null }) => {
    const wanted = thing.slug && !slugError(thing.slug) ? thing.slug : null;
    const base =
      wanted ??
      ((s) => (s && !slugError(s) ? s : null))(slugify(thing.name)) ??
      ((s) => (s && !slugError(s) ? s : `item-${s || 'x'}`))(slugify(thing.id));
    let slug = base;
    for (let n = 2; taken.has(slug); n++)
      slug = `${base.slice(0, SLUG_MAX - String(n).length - 1)}-${n}`;
    taken.add(slug);
    return slug;
  };
  // Collections first: a shelf's address is the steadier one.
  const cs = collections.map((c) => ({ ...c, slug: give(c) }));
  const is = items.map((i) => ({ ...i, slug: give(i) }));
  return { items: is, collections: cs };
}

/** What an address under a host is: one of its items, one of its collections, or neither. */
export function bySlug<I extends Pick<BookingItem, 'slug'>, C extends { slug: string }>(
  items: readonly I[],
  collections: readonly C[],
  slug: string,
): { kind: 'item'; item: I } | { kind: 'collection'; collection: C } | null {
  const want = slug.normalize('NFC').toLowerCase();
  const c = collections.find((x) => x.slug === want);
  if (c) return { kind: 'collection', collection: c };
  const i = items.find((x) => x.slug === want);
  return i ? { kind: 'item', item: i } : null;
}

export { grouped, itemsIn } from './booking';

/** The collections this viewer may see, in the host's order (the same standing as `canBook`). */
export function visibleCollections<C extends { audience: BookingAudience }>(
  collections: readonly C[],
  viewer: { isSelf?: boolean; isConnected: boolean; spheres: readonly Sphere[] },
): C[] {
  return collections.filter((c) => canBook(c.audience, viewer));
}
