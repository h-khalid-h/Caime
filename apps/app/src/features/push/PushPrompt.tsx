import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { pushState } from './support';

const SEEN = 'caishy.push-prompt';
const answered = () => {
  try {
    return globalThis.localStorage?.getItem(SEEN) === '1';
  } catch {
    return true;
  }
};

/**
 * Once, at the top of Chats in a browser that hasn't been asked: calls and messages can reach
 * them when Caishy isn't open. The browser asks only when they press Turn on.
 */
export function PushPrompt() {
  const t = useTheme();
  const [shown, setShown] = useState(() => pushState() === 'default' && !answered());
  if (!shown) return null;
  const done = () => {
    try {
      globalThis.localStorage?.setItem(SEEN, '1');
    } catch {
      // Private browsing: it asks again next time.
    }
    setShown(false);
  };
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 14,
        gap: 10,
        borderRadius: 16,
        backgroundColor: t.c.accentSoft,
      }}
      testID="push-prompt"
    >
      <Text variant="bodyStrong" color={t.scheme === 'dark' ? 'text' : 'accentStrong'}>
        Hear calls and messages when Caishy isn’t open
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label="Turn on"
          size="sm"
          onPress={() =>
            void import('./webPush')
              .then((m) => m.enableWebPush())
              .then((answer) => {
                if (answer === 'granted') toast('Notifications are on in this browser');
              })
              .catch(() => toast('This browser couldn’t turn them on.', { tone: 'danger' }))
              .finally(done)
          }
          testID="push-prompt-on"
        />
        <Button label="Not now" size="sm" variant="ghost" onPress={done} />
      </View>
    </View>
  );
}
