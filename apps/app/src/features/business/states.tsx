import { THREAD_STATE_LABELS, type ThreadState } from '@caime/core/business';
import { tr } from '@caime/core/i18n';
import { View } from 'react-native';
import { type Theme, useTheme } from '@/theme/theme';
import { Text } from '@/ui/Text';

type Tone = {
  bg: keyof Theme['c'];
  fg: 'accentStrong' | 'warning' | 'textSecondary' | 'danger' | 'success';
};

/** Each state keeps one colour everywhere: the inbox, the thread bar, the chat header. */
const TONES: Record<ThreadState, Tone> = {
  new: { bg: 'accentSoft', fg: 'accentStrong' },
  customer_waiting: { bg: 'warningSoft', fg: 'warning' },
  waiting: { bg: 'surfaceMuted', fg: 'textSecondary' },
  escalated: { bg: 'dangerSoft', fg: 'danger' },
  resolved: { bg: 'successSoft', fg: 'success' },
};

/**
 * A conversation its customer closed by blocking the organization reads "Closed", in grey; one
 * the team wrote first that they haven't answered reads "Request sent" (R14).
 */
export function StateChip({
  state,
  closed = false,
  request = false,
  testID,
}: {
  state: ThreadState;
  closed?: boolean;
  request?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const tone: Tone = closed || request ? { bg: 'surfaceMuted', fg: 'textSecondary' } : TONES[state];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: t.c[tone.bg] as string,
      }}
      testID={testID}
    >
      <Text variant="captionStrong" color={tone.fg}>
        {closed
          ? tr('Closed by the customer')
          : request
            ? tr('Request sent')
            : tr(THREAD_STATE_LABELS[state])}
      </Text>
    </View>
  );
}
