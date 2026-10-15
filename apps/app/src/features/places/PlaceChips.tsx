/**
 * Places to fill a card from (R92): the viewer's own, and the other side's they may see in this
 * conversation, as chips. A tap copies the place's words (and, for a Location card, its point)
 * into the card: the card keeps them whatever happens to the place after.
 */
import type { PlaceView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { placeLine } from '@caime/core/places';
import { useQuery } from '@tanstack/react-query';
import MapPin from 'lucide-react-native/icons/map-pin';
import { ScrollView } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Chip } from '@/ui/Chip';
import { useCountryName } from './countryName';
import { placeName } from './placeName';

export function PlaceChips({
  conversationId,
  mineOnly = false,
  onPick,
  testID,
}: {
  conversationId: string;
  /** Only the viewer's own (a delivery address). */
  mineOnly?: boolean;
  /** The place's words, and the place (its point, for a Location card). */
  onPick: (line: string, place: PlaceView) => void;
  testID: string;
}) {
  const countryName = useCountryName();
  const q = useQuery({
    queryKey: qk.conversationPlaces(conversationId),
    queryFn: () => endpoints.conversationPlaces(conversationId),
    staleTime: 60_000,
  });
  const mine = q.data?.mine ?? [];
  const theirs = mineOnly ? [] : (q.data?.theirs ?? []);
  if (!mine.length && !theirs.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
      accessibilityLabel={tr('Your places and theirs')}
      testID={testID}
    >
      {mine.map((p, i) => (
        <Chip
          key={p.id}
          icon={MapPin}
          label={placeName(p)}
          onPress={() => onPick(placeLine(p, countryName), p)}
          testID={`${testID}-mine-${i}`}
        />
      ))}
      {theirs.flatMap((group, g) =>
        group.places.map((p, i) => (
          <Chip
            key={p.id}
            icon={MapPin}
            label={tr('{name}’s {place}', { name: group.owner, place: placeName(p) })}
            onPress={() => onPick(placeLine(p, countryName), p)}
            testID={`${testID}-theirs-${g}-${i}`}
          />
        )),
      )}
    </ScrollView>
  );
}
