import { describe, expect, it } from 'vitest';
import { type BookingItem, bookableItems } from './booking';
import {
  bySlug,
  grouped,
  RESERVED_SLUGS,
  slugError,
  slugify,
  visibleCollections,
  withSlugs,
} from './catalog';
import { BookingBody } from './schemas';

const item = (id: string, patch: Partial<BookingItem> = {}): BookingItem => ({
  id,
  name: id,
  price: null,
  unit: 'minutes',
  minutes: 30,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: null,
  askTopic: false,
  slug: id,
  description: null,
  collectionId: null,
  ...patch,
});

describe('addresses for a catalog (R61)', () => {
  it('makes an address from a name in any script', () => {
    expect(slugify('Hair oil (50 ml)')).toBe('hair-oil-50-ml');
    expect(slugify('Çay & Börek')).toBe('cay-borek');
    expect(slugify('Işık Kesimi')).toBe('isik-kesimi');
    expect(slugify('Crème brûlée')).toBe('creme-brulee');
    expect(slugify('قص الشعر')).toBe('قص-الشعر');
    expect(slugify('  --  ')).toBe('');
  });

  it('refuses the host’s own words and anything not letters, digits and hyphens', () => {
    for (const word of RESERVED_SLUGS) expect(slugError(word)).toBe('reserved');
    expect(slugError('hair oil')).toBe('shape');
    expect(slugError('Hair')).toBe('shape');
    expect(slugError('-a')).toBe('shape');
    expect(slugError('haircut')).toBeNull();
    expect(slugError('قص-الشعر')).toBeNull();
  });

  it('gives every item and collection one address, unique across both', () => {
    const { items, collections } = withSlugs(
      [
        { id: 'a', name: 'Haircut', slug: null },
        { id: 'b', name: 'Haircut' },
        { id: 'c', name: 'Treatments' },
        { id: 'd', name: 'Setup' },
        { id: 'e', name: '!!!' },
      ],
      [{ id: 'k', name: 'Treatments', slug: 'treatments' }],
    );
    expect(collections.map((c) => c.slug)).toEqual(['treatments']);
    expect(items.map((i) => i.slug)).toEqual(['haircut', 'haircut-2', 'treatments-2', 'd', 'e']);
    // The same catalog read twice gives the same addresses.
    expect(withSlugs(items, collections).items.map((i) => i.slug)).toEqual(
      items.map((i) => i.slug),
    );
  });

  it('finds what an address is, a collection before an item', () => {
    const items = [item('cut', { slug: 'haircut' })];
    const shelves = [
      { id: 's', slug: 'hair', name: 'Hair', description: null, audience: 'public' as const },
    ];
    expect(bySlug(items, shelves, 'HAIRCUT')).toMatchObject({ kind: 'item' });
    expect(bySlug(items, shelves, 'hair')).toMatchObject({ kind: 'collection' });
    expect(bySlug(items, shelves, 'nails')).toBeNull();
  });
});

describe('collections (R61)', () => {
  const shelves = [
    { id: 'pub', name: 'Treatments', audience: 'public' as const },
    { id: 'fam', name: 'Family', audience: ['family' as const] },
  ];
  const items = [
    item('a', { collectionId: 'pub' }),
    item('b', { collectionId: 'fam' }),
    item('c'),
    item('d', { collectionId: 'gone' }),
  ];
  const stranger = { isConnected: false, spheres: [] };
  const sister = { isConnected: true, spheres: ['family' as const] };

  it('groups items under their collections, then the rest', () => {
    expect(
      grouped(items, shelves).map((g) => [g.collection?.id ?? null, g.items.map((i) => i.id)]),
    ).toEqual([
      ['pub', ['a']],
      ['fam', ['b']],
      [null, ['c', 'd']],
    ]);
  });

  it('lets someone see an item only where its collection allows them too', () => {
    const asCollections = shelves.map((c) => ({ ...c, audience: c.audience }));
    expect(
      bookableItems(items, stranger, { adult: true, collections: asCollections }).map((i) => i.id),
    ).toEqual(['a', 'c', 'd']);
    expect(
      bookableItems(items, sister, { adult: true, collections: asCollections }).map((i) => i.id),
    ).toEqual(['a', 'b', 'c', 'd']);
    expect(visibleCollections(asCollections, stranger).map((c) => c.id)).toEqual(['pub']);
  });

  it('takes one address per host, and a collection that is there', () => {
    const body = (patch: object) =>
      BookingBody.safeParse({
        booking: null,
        items: [
          {
            ...item('a', { collectionId: 'k' }),
            audience: 'public',
          },
        ],
        collections: [{ id: 'k', name: 'Hair', slug: 'hair', audience: 'public' }],
        ...patch,
      });
    expect(body({}).success).toBe(true);
    expect(
      body({ collections: [{ id: 'k', name: 'Hair', slug: 'a', audience: 'public' }] }).success,
    ).toBe(false);
    expect(body({ collections: [] }).success).toBe(false);
    expect(
      body({ collections: [{ id: 'k', name: 'Hair', slug: 'setup', audience: 'public' }] }).success,
    ).toBe(false);
  });
});
