import { tr } from '@caime/core/i18n';
import { type ErrorBoundaryProps, router } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Guide } from '@/ui/Guide';
import { CircleAlert } from '@/ui/icons';
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
      <Guide character="panda" expression="sad" icon={CircleAlert} size={120} />
      <Text variant="headline" align="center">
        {tr('Something went wrong on this screen')}
      </Text>
      <Text variant="body" color="textSecondary" align="center" style={{ maxWidth: 420 }}>
        {tr(
          'Your messages are safe. Try again, and if it keeps happening, tell us what you were doing.',
        )}
      </Text>
      {__DEV__ ? (
        <Text variant="caption" color="danger" align="center" selectable>
          {error.message}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label={tr('Try again')} onPress={() => void retry()} />
        <Button
          label={tr('Go to Chats')}
          variant="secondary"
          onPress={() => router.replace('/chats')}
        />
      </View>
    </View>
  );
}
