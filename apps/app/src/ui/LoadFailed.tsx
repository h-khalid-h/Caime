import { tr } from '@caime/core/i18n';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import { View } from 'react-native';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

/**
 * What a place says when what it shows couldn't load (M16 E1, review 2026-10-17 §7 H5): what
 * failed, the reason when one came back, and Try again. Never "nothing needs you", a first run or
 * "the beginning of your conversation", which a failed load would make a false thing to say.
 */
export function LoadFailed({
  title,
  error,
  onRetry,
  compact,
  testID,
}: {
  title: string;
  error?: unknown;
  onRetry: () => void;
  compact?: boolean;
  testID?: string;
}) {
  const reason = error instanceof Error && error.message ? error.message : null;
  return (
    <View accessibilityRole="alert" testID={testID}>
      <EmptyState
        character="panda"
        expression="sad"
        icon={CircleAlert}
        title={title}
        body={reason ?? tr('Check your connection, then try again.')}
        action={<Button label={tr('Try again')} variant="secondary" onPress={onRetry} />}
        compact={compact}
      />
    </View>
  );
}
