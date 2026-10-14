import { tr } from '@caime/core/i18n';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { isWeb } from '@/lib/config';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { promptAnswered, promptAtStart, promptLater } from './support';

/**
 * Once, at the top of Chats on a device that hasn't been asked (a browser, or a phone): calls and
 * messages can reach them when Caime isn't open. The device asks only when they press Turn on.
 */
export function PushPrompt() {
  const t = useTheme();
  // A browser knows at the first frame; a phone looks it up, and shows it a moment later.
  const [shown, setShown] = useState(promptAtStart);
  useEffect(() => {
    let live = true;
    void promptLater().then((wanted) => {
      if (live) setShown(wanted);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!shown) return null;
  const done = () => {
    promptAnswered();
    setShown(false);
  };
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 14,
        gap: 10,
        borderRadius: t.radii.lg,
        backgroundColor: t.c.accentSoft,
      }}
      testID="push-prompt"
    >
      <Text variant="bodyStrong" color={t.scheme === 'dark' ? 'text' : 'accentStrong'}>
        {tr('Hear calls and messages when Caime isn’t open')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label={tr('Turn on')}
          size="sm"
          onPress={() =>
            void import('./push')
              .then((m) => m.enablePush())
              .then((answer) => {
                if (answer === 'granted')
                  toast(
                    isWeb
                      ? tr('Notifications are on in this browser')
                      : tr('Notifications are on for this phone'),
                  );
              })
              .catch(() =>
                toast(
                  isWeb
                    ? tr('This browser couldn’t turn them on.')
                    : tr('This phone couldn’t turn them on.'),
                  { tone: 'danger' },
                ),
              )
              .finally(done)
          }
          testID="push-prompt-on"
        />
        <Button label={tr('Not now')} size="sm" variant="ghost" onPress={done} />
      </View>
    </View>
  );
}
