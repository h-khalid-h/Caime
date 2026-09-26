import { THREAD_STATE_LABELS, type ThreadState } from '@caishy/core/business';
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

/** A conversation its customer closed by blocking the organization reads "Closed", in grey. */
export function StateChip({
  state,
  closed = false,
  testID,
}: {
  state: ThreadState;
  closed?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const tone: Tone = closed ? { bg: 'surfaceMuted', fg: 'textSecondary' } : TONES[state];
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
        {closed ? 'Closed by the customer' : THREAD_STATE_LABELS[state]}
      </Text>
    </View>
  );
}
