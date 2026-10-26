/**
 * The meeting or appointment next in a conversation (R123), at its top until it ends: what it's
 * called, when, how many are going in a group (or that the reader isn't), and Join while it's
 * open. A tap goes to its card; Join goes there and opens its call the way a calendar's join
 * address does, so the card's own rules (Cai's notes asked for, a call already on) decide. Nobody
 * scrolls for this week's meeting. One read a conversation opened, asked again when a card in it
 * changes (realtime/apply.ts).
 */
import type { NextCardView } from '@caime/core/api';
import { formatWhenAt } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { calendarAction } from '@caime/core/meetings';
import { useQuery } from '@tanstack/react-query';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import { View } from 'react-native';
import { qk } from '@/api/keys';
import { meetingApi } from '@/features/kits/meetingApi';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/** What the line says after its time: who's going, or the reader's own no. */
function whoLine(next: NextCardView): string | null {
  if (next.answer === 'not_going') return tr('You’re not going');
  if (next.going !== null) return trn(next.going, '{n} going', '{n} going');
  return next.agreed ? null : tr('Asked, not yet answered');
}

export function NextCardLine({
  conversationId,
  onGo,
  onJoin,
}: {
  conversationId: string;
  /** Go to its card in the conversation. */
  onGo: (next: NextCardView) => void;
  /** Join its call, as its card would. */
  onJoin: (next: NextCardView) => void;
}) {
  const t = useTheme();
  const { timeZone, locale } = useUserClock();
  const now = useNow();
  const next = useQuery({
    queryKey: qk.nextCard(conversationId),
    queryFn: () => meetingApi.next(conversationId),
    staleTime: 60_000,
  }).data?.next;
  // Over (half an hour past its end, as Join): gone from here until the next is read.
  if (!next || Date.parse(next.endAt) + 30 * 60_000 <= now.getTime()) return null;
  const when = formatWhenAt(next.at, next.hasTime, now, timeZone, locale);
  const action = calendarAction(
    {
      kind: next.kit,
      state: next.agreed ? 'agreed' : 'asked',
      hasTime: next.hasTime,
      at: next.at,
      endAt: next.endAt,
      place: next.place,
      heldHere: next.heldHere,
    },
    now,
  );
  const joinable = action === 'join' && !next.projected && next.answer !== 'not_going';
  const who = whoLine(next);
  const said = [next.title, when, who].filter(Boolean).join(' · ');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingStart: 12,
        paddingEnd: 8,
        borderBottomWidth: 1,
        borderBottomColor: t.c.border,
        backgroundColor: t.c.surface,
      }}
      testID="next-card"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${next.kit === 'appointment' ? tr('Next appointment') : tr('Next meeting')}: ${said}`}
        accessibilityHint={tr('Goes to it')}
        onPress={() => onGo(next)}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <CalendarClock size={16} color={t.c.accentStrong} />
        <View style={{ flex: 1, minWidth: 0, paddingVertical: 8 }}>
          <Text variant="captionStrong" color="accentStrong" numberOfLines={1}>
            {next.title}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1} testID="next-card-when">
            {[when, who].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Pressable>
      {joinable ? (
        <Button label={tr('Join')} size="sm" onPress={() => onJoin(next)} testID="next-card-join" />
      ) : null}
    </View>
  );
}
