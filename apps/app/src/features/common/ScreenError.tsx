import { type ErrorBoundaryProps, router } from 'expo-router';
import { View } from 'react-native';
import { Character } from '@/brand/Character';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

/** What a screen shows if it breaks: an apology, a retry, and a way home. Never a blank page. */
export function ScreenError({ error, retry }: ErrorBoundaryProps) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 28,
        backgroundColor: t.c.canvas,
      }}
    >
      <Character name="panda" expression="sad" size={120} />
      <Text variant="headline" align="center">
        Something went wrong on this screen
      </Text>
      <Text variant="body" color="textSecondary" align="center" style={{ maxWidth: 420 }}>
        Your messages are safe. Try again, and if it keeps happening, tell us what you were doing.
      </Text>
      {__DEV__ ? (
        <Text variant="caption" color="danger" align="center" selectable>
          {error.message}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Try again" onPress={() => void retry()} />
        <Button label="Go to Chats" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    </View>
  );
}
