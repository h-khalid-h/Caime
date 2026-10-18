/**
 * How to get Caime's notifications on an iPhone or an iPad (review 2026-10-17 §1 H7), on
 * Attention while a browser tab can't be notified: Share, then Add to Home Screen, then open
 * Caime from there. Loaded only on an Apple device's tab without push, and drawn only when
 * `homeScreenHint` says so; "Not now" is remembered on this browser.
 */
import { tr } from '@caime/core/i18n';
import Share from 'lucide-react-native/icons/share';
import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { dismissHomeScreenHint, homeScreenHint } from './homeScreen';

export function HomeScreenCard() {
  const t = useTheme();
  // Read once: whether this tab can't be notified, and on which device.
  const [device] = useState(homeScreenHint);
  const [gone, setGone] = useState(false);
  if (!device || gone) return null;
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 14,
        gap: 10,
        borderRadius: t.radii.lg,
        backgroundColor: t.c.surfaceMuted,
      }}
      testID="home-screen-card"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Share size={18} color={t.c.textSecondary} strokeWidth={2.2} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {device === 'ipad'
            ? tr('Notifications on this iPad')
            : tr('Notifications on this iPhone')}
        </Text>
      </View>
      <Text variant="caption" color="textSecondary">
        {tr(
          'Caime can notify you only once it’s on the Home Screen: tap Share, then Add to Home Screen, and open it from there.',
        )}
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <Button
          label={tr('Not now')}
          size="sm"
          variant="secondary"
          onPress={() => {
            dismissHomeScreenHint();
            setGone(true);
          }}
          testID="home-screen-later"
        />
      </View>
    </View>
  );
}
