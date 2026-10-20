/**
 * Where a meeting or an appointment is (M16 F6, always said): on Caime, a call in its
 * conversation, offered where one can be made; one of the places the person filling it in may
 * see (their own, and the other side's they're shown: R92); or somewhere else, typed (an
 * address, or a link to another service). The card keeps its Where as words (`fields.place`):
 * "Caime", the place's address as written now, or what was typed, which every reader of the card
 * reads by core `cardVenue`. The choice is the form's; this draws it and fills the words.
 */
import type { PlaceView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { placeLine } from '@caime/core/places';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { ChoiceChips } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useCountryName } from './countryName';
import { placeName } from './placeName';

/** What was chosen: on Caime, somewhere typed, or a place by its id. */
export type WhereChoice = 'caime' | 'other' | `place:${string}`;

export function WherePicker({
  conversationId,
  callable,
  value,
  text,
  onChange,
  testID,
}: {
  conversationId: string;
  /** Whether its conversation holds a call its people can join, so On Caime is offered. */
  callable: boolean;
  value: WhereChoice | null;
  /** The card's Where as it stands: what's typed for somewhere else. */
  text: string;
  onChange: (choice: WhereChoice | null, words: string) => void;
  testID: string;
}) {
  const countryName = useCountryName();
  const q = useQuery({
    queryKey: qk.conversationPlaces(conversationId),
    queryFn: () => endpoints.conversationPlaces(conversationId),
    staleTime: 60_000,
  });
  const places: Array<{ place: PlaceView; label: string }> = [
    ...(q.data?.mine ?? []).map((p) => ({ place: p, label: placeName(p) })),
    ...(q.data?.theirs ?? []).flatMap((group) =>
      group.places.map((p) => ({
        place: p,
        label: tr('{name}’s {place}', { name: group.owner, place: placeName(p) }),
      })),
    ),
  ];
  const pick = (choice: WhereChoice | null) => {
    if (choice === 'caime') return onChange(choice, 'Caime');
    if (choice === 'other') return onChange(choice, value === 'other' ? text : '');
    const chosen = places.find((p) => `place:${p.place.id}` === choice);
    onChange(choice, chosen ? placeLine(chosen.place, countryName) : '');
  };
  return (
    <View style={{ gap: 8 }} testID={testID}>
      <Text variant="label">{tr('Where')}</Text>
      <ChoiceChips<WhereChoice>
        wrap
        flush
        label={tr('Where')}
        value={value}
        onChange={pick}
        options={[
          ...(callable
            ? [{ value: 'caime' as const, label: tr('On Caime'), testID: `${testID}-caime` }]
            : []),
          ...places.map((p, i) => ({
            value: `place:${p.place.id}` as const,
            label: p.label,
            testID: `${testID}-place-${i}`,
          })),
          { value: 'other' as const, label: tr('Somewhere else'), testID: `${testID}-other` },
        ]}
        testID={`${testID}-choices`}
      />
      {value === 'caime' ? (
        <Text variant="caption" color="textTertiary">
          {tr('A call in this conversation, with Join at its time.')}
        </Text>
      ) : value === 'other' ? (
        <TextField
          label={tr('Where')}
          placeholder={tr('Place or link')}
          value={text}
          onChangeText={(v) => onChange('other', v)}
          testID="kit-field-place"
        />
      ) : null}
    </View>
  );
}
