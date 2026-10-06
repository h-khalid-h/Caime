/**
 * One of a host's items, or one of its collections (R61), opened from its address
 * (`/o/<handle>/<slug>`, `/@<handle>/<slug>`): what it is, and its own Book or Order, which
 * opens the card's form with it chosen. A public one shows its link to share. Loaded when
 * opened, by the organization's and the person's screens alike.
 */
import { type BookingItem, isOrdered, itemPhotoPath } from '@caime/core/booking';
import type { CatalogCollection } from '@caime/core/catalog';
import { formatAmount } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import { View } from 'react-native';
import { WEB_URL } from '@/lib/config';
import { Button } from '@/ui/Button';
import { CopyRow } from '@/ui/CopyRow';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { ItemPhoto } from './ItemPhoto';

/** "45 min · EGP 200": what an item is, as its page says it. */
function line(item: BookingItem, locale: string): string {
  return [
    item.unit === 'minutes'
      ? tr('{m} min', { m: item.minutes ?? 0 })
      : item.unit === 'days'
        ? tr('Per day')
        : null,
    item.price ? formatAmount(item.price.value, item.price.currency, locale) : tr('Free'),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ItemSheet({
  slug,
  hostPath,
  hostRef,
  items,
  collections,
  locale,
  onPick,
  onTake,
  onClose,
}: {
  /** The address opened, or null when closed. */
  slug: string | null;
  /** The host's own path (`/o/nile.dental`), for the link to share. */
  hostPath: string;
  /** The host, for its items' photos (R63). */
  hostRef: { kind: 'org' | 'person'; id: string };
  /** What this viewer may book or order, and the collections they may see. */
  items: BookingItem[];
  collections: CatalogCollection[];
  locale: string;
  /** Another address of the host's: an item in the collection shown. */
  onPick: (slug: string) => void;
  /** Book or order this item: the card's form, with it chosen. */
  onTake: ((item: BookingItem) => void) | null;
  onClose: () => void;
}) {
  // What the address is: a collection before an item, as the server reads it (core `bySlug`,
  // not imported: this sheet's chunk stays apart from the catalog's address rules).
  const shelfFound = slug ? collections.find((c) => c.slug === slug) : undefined;
  const itemFound = slug && !shelfFound ? items.find((i) => i.slug === slug) : undefined;
  const found = shelfFound
    ? { kind: 'collection' as const, collection: shelfFound }
    : itemFound
      ? { kind: 'item' as const, item: itemFound }
      : null;
  const shelfOf = (item: BookingItem) =>
    collections.find((c) => c.id === item.collectionId) ?? null;
  const publicLink = (thing: { slug: string; audience: BookingItem['audience'] }) =>
    thing.audience === 'public' ? `${WEB_URL}${hostPath}/${encodeURIComponent(thing.slug)}` : null;

  if (!found)
    return (
      <Sheet open={slug !== null} onClose={onClose} title={tr('Not here any more')}>
        <Text variant="body" color="textSecondary" testID="item-missing">
          {tr('It may have been taken off, or it isn’t offered to you.')}
        </Text>
      </Sheet>
    );

  if (found.kind === 'collection') {
    const c = found.collection;
    const inside = items.filter((i) => i.collectionId === c.id);
    const link = publicLink(c);
    return (
      <Sheet
        open={slug !== null}
        onClose={onClose}
        title={c.name}
        subtitle={c.description ?? undefined}
      >
        <View style={{ gap: 14 }} testID="collection-sheet">
          {inside.length === 0 ? (
            <Text variant="body" color="textSecondary">
              {tr('Nothing here you can take yet.')}
            </Text>
          ) : (
            inside.map((i) => (
              <Pressable
                key={i.id}
                accessibilityRole="button"
                onPress={() => onPick(i.slug)}
                testID={`collection-item-${i.slug}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <ItemPhoto path={itemPhotoPath(hostRef, i)} size={48} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{i.name}</Text>
                  <Text variant="caption" color="textSecondary">
                    {line(i, locale)}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
          {link ? <CopyRow label={tr('Link to share')} value={link} /> : null}
        </View>
      </Sheet>
    );
  }

  const item = found.item;
  const shelf = shelfOf(item);
  const ordered = isOrdered(item);
  const link = publicLink(item);
  return (
    <Sheet
      open={slug !== null}
      onClose={onClose}
      title={item.name}
      subtitle={item.description ?? undefined}
      footer={
        onTake ? (
          <Button
            label={ordered ? tr('Order') : tr('Book')}
            icon={ordered ? ShoppingBag : CalendarCheck}
            block
            onPress={() => onTake(item)}
            testID="item-take"
          />
        ) : undefined
      }
    >
      <View style={{ gap: 14 }} testID="item-sheet">
        <ItemPhoto path={itemPhotoPath(hostRef, item)} size={200} wide label={item.name} />
        <Spec
          rows={[
            { label: ordered ? tr('price') : tr('booking'), value: line(item, locale) },
            shelf
              ? {
                  label: tr('collection'),
                  value: (
                    <Pressable accessibilityRole="link" onPress={() => onPick(shelf.slug)}>
                      <Text variant="body" color="accentStrong">
                        {shelf.name}
                      </Text>
                    </Pressable>
                  ),
                }
              : null,
          ]}
        />
        {link ? <CopyRow label={tr('Link to share')} value={link} /> : null}
      </View>
    </Sheet>
  );
}
