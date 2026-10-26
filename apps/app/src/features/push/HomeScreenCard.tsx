/**
 * Caime from the Home Screen, the Dock or the Start menu, one card on Attention (R120). On an
 * iPhone's or an iPad's tab, which nothing can notify (review 2026-10-17 §1 H7): Share, then Add
 * to Home Screen, then open Caime from there (`homeScreenHint`). Where the browser installs sites,
 * once someone has come back (`INSTALL_AFTER_MS`): the browser's own offer from a tap (Chromium,
 * `install`), or Safari's Add to Dock on a Mac, told. Never a prompt of its own; "Not now" is
 * remembered on this browser. Loaded on a browser tab only.
 */
import { tr } from '@caime/core/i18n';
import Download from 'lucide-react-native/icons/download';
import Share from 'lucide-react-native/icons/share';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import {
  dismissHomeScreenHint,
  dismissInstallHint,
  homeScreenHint,
  INSTALL_AFTER_MS,
  installHintDismissed,
} from './homeScreen';

export function HomeScreenCard({ accountSince }: { accountSince: string | null }) {
  const t = useTheme();
  const offerInstall =
    accountSince !== null && Date.now() - new Date(accountSince).getTime() > INSTALL_AFTER_MS;
  // Read once: whether this tab can't be notified, and on which device.
  const [device] = useState(homeScreenHint);
  const [offer, setOffer] = useState<'prompt' | 'dock' | null>(null);
  const [gone, setGone] = useState(false);
  // The browser's offer can come a moment after the page: the push module holds it.
  useEffect(() => {
    if (device || !offerInstall || installHintDismissed()) return;
    let live = true;
    let stop = () => {};
    void import('@/features/push/push')
      .then((m) => {
        if (!live) return;
        const read = () => setOffer(m.installOffer());
        read();
        stop = m.onInstallOffer(read);
      })
      .catch(() => {});
    return () => {
      live = false;
      stop();
    };
  }, [device, offerInstall]);
  if (gone || (!device && !offer)) return null;
  const later = () => {
    if (device) dismissHomeScreenHint();
    else dismissInstallHint();
    setGone(true);
  };
  const Icon = device ? Share : Download;
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
      testID={device ? 'home-screen-card' : 'install-card'}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon size={18} color={t.c.textSecondary} strokeWidth={2.2} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {device === 'ipad'
            ? tr('Notifications on this iPad')
            : device === 'iphone'
              ? tr('Notifications on this iPhone')
              : tr('Caime as an app')}
        </Text>
      </View>
      <Text variant="caption" color="textSecondary">
        {device
          ? tr(
              'Caime can notify you only once it’s on the Home Screen: tap Share, then Add to Home Screen, and open it from there.',
            )
          : offer === 'dock'
            ? tr(
                'In Safari, choose File, then Add to Dock: Caime opens in a window of its own, with what needs you counted on its icon.',
              )
            : tr(
                'Install Caime to open it from your dock, taskbar or home screen, in a window of its own, with what needs you counted on its icon.',
              )}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {offer === 'prompt' && !device ? (
          <Button
            label={tr('Install')}
            size="sm"
            onPress={() => {
              void import('@/features/push/push')
                .then((m) => m.install())
                .then((took) => {
                  if (took) setGone(true);
                })
                .catch(() => {});
            }}
            testID="install-now"
          />
        ) : null}
        <Button
          label={tr('Not now')}
          size="sm"
          variant="secondary"
          onPress={later}
          testID={device ? 'home-screen-later' : 'install-later'}
        />
      </View>
    </View>
  );
}
