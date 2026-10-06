/**
 * What's coming up (PRD §41): the meetings and appointments ahead in a conversation, or in a
 * space's conversations (its shared calendar), soonest first. Each opens its card.
 */

import type { UpcomingView } from '@caime/core/api';
import { formatWhenAt } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import { View } from 'react-native';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

type Item = UpcomingView & { conversationTitle?: string };

/** "45 min", "1 hour", "1½ hours". */
function lengthText(minutes: number): string {
  if (minutes < 60) return tr('{n} min', { n: minutes });
  const hours = minutes / 60;
  if (hours === 1) return tr('1 hour');
  return Number.isInteger(hours)
    ? trn(hours, '{n} hour', '{n} hours')
    : hours === 1.5
      ? tr('1½ hours')
      : tr('{n} min', { n: minutes });
}

export function ComingUpList({
  items,
  onOpen,
  showWhere = false,
}: {
  items: Item[];
  onOpen: (item: Item) => void;
  /** In a space: which of its conversations each is in. */
  showWhere?: boolean;
}) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  return (
    <View style={{ gap: 10 }}>
      {items.map((u) => {
        const asked = u.agreed ? null : u.kit === 'meeting' ? 'Proposed' : 'Requested';
        const line = [
          formatWhenAt(u.at, u.hasTime, now, timeZone, locale),
          u.hasTime && u.durationMinutes ? lengthText(u.durationMinutes) : null,
          u.place,
          showWhere && u.conversationTitle ? `in ${u.conversationTitle}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Pressable
            key={u.messageId}
            accessibilityRole="button"
            accessibilityLabel={`${u.title}, ${line}${asked ? `, ${asked.toLowerCase()}` : ''}`}
            onPress={() => onOpen(u)}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: 44 }}
            testID="coming-up-item"
          >
            <CalendarClock size={18} color={u.agreed ? t.c.accentStrong : t.c.textTertiary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={2} auto>
                {u.title}
              </Text>
              <Text variant="caption" color="textSecondary">
                {line}
              </Text>
            </View>
            {asked ? (
              <Text variant="captionStrong" color="textTertiary">
                {asked}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
