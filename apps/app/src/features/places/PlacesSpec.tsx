/**
 * Places as facts (R92): each a spec row, its name and its address in the reader's language,
 * with a map when its owner took the point where they stood. What a profile and an
 * organization's page show of the places their owner lets this viewer see.
 */
import type { PlaceView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { mapsUrl, placeLine } from '@caime/core/places';
import { View, type ViewStyle } from 'react-native';
import { openLink } from '@/lib/links';
import { Pressable } from '@/ui/Pressable';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { useCountryName } from './countryName';
import { placeName } from './placeName';

export function PlacesSpec({
  places,
  testID,
  style,
}: {
  places: PlaceView[];
  testID?: string;
  style?: ViewStyle;
}) {
  const countryName = useCountryName();
  if (!places.length) return null;
  return (
    <Spec
      testID={testID}
      style={style}
      rows={places.map((p, i) => ({
        label: placeName(p),
        testID: testID ? `${testID}-${i}` : undefined,
        value: (
          <View style={{ gap: 2 }}>
            <Text variant="body" auto>
              {placeLine(p, countryName)}
            </Text>
            {p.directions ? (
              <Text variant="caption" color="textSecondary" auto>
                {p.directions}
              </Text>
            ) : null}
            {p.point ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => p.point && openLink(mapsUrl(p.point))}
              >
                <Text variant="captionStrong" color="link">
                  {tr('Map')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ),
      }))}
    />
  );
}
