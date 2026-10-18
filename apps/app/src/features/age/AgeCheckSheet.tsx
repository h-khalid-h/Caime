/**
 * Checking one's age (M16 B7): why Caime asks (the trigger the server named), what happens on the
 * provider's page and what Caime learns of it, and the way there. One sheet, opened from anywhere
 * by `askAgeCheck` (a refused call opens it through the API client); loaded when first asked.
 */
import { tr } from '@caime/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { useAgeCheck } from './ageCheck';
import { sayAgeReturn } from './said';
import { startAgeCheck } from './start';

export function AgeCheckSheet() {
  const asked = useAgeCheck((s) => s.asked);
  const last = useSession((s) => s.user?.ageCheck ?? null);
  const [busy, setBusy] = useState(false);
  const close = () => useAgeCheck.setState({ asked: null });
  const why =
    asked === 'org'
      ? tr('Before you start an organization, Caime asks you to check your age once.')
      : asked === 'paid'
        ? tr('Before you sell something for a price, Caime asks you to check your age once.')
        : asked === 'stranger'
          ? tr(
              'Before you write first to someone you’re not connected with, Caime asks you to check your age once.',
            )
          : null;
  const begin = async () => {
    setBusy(true);
    try {
      const done = await startAgeCheck(asked && asked !== 'self' ? asked : null);
      if (done === 'left') return;
      close();
      if (done !== 'cancel') sayAgeReturn(done);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={asked !== null} onClose={close} title={tr('Check your age')}>
      <View style={{ gap: 12 }} testID="age-check">
        {why ? (
          <Text variant="bodyStrong" testID="age-check-why">
            {why}
          </Text>
        ) : null}
        <Text variant="body" color="textSecondary">
          {tr(
            'It takes a minute on the age-check provider’s own page: a selfie, or a document if you’d rather. Caime learns whether you’re 18 or over, never the picture.',
          )}
        </Text>
        {last?.outcome === 'minor' ? (
          <Text variant="body" color="textSecondary">
            {tr(
              'The last check found you’re under 18. If that’s wrong, check again with a document.',
            )}
          </Text>
        ) : null}
        <Button
          label={tr('Check my age')}
          loading={busy}
          onPress={begin}
          testID="age-check-start"
        />
        <Button
          label={tr('Not now')}
          variant="secondary"
          onPress={close}
          testID="age-check-later"
        />
      </View>
    </Sheet>
  );
}
