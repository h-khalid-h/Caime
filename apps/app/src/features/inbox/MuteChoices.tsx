/**
 * For how long a conversation keeps quiet: the spans people most often want, the next morning
 * where they are, until they turn it back on, or until a day and time they pick. Shown inside the
 * sheet that offers it (RowActions), the day and time too: iOS shows one sheet at a time from a
 * screen, so one never replaces another in the same moment.
 */

import { tr } from '@caime/core/i18n';
import BellOff from 'lucide-react-native/icons/bell-off';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import { type Chosen, instantOf, todayWhere } from '@/features/when/when';
import { useUserClock } from '@/lib/time';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { formatTime } from '@/ui/times';

/** Choosing a day and time, loaded when it's asked for (as everywhere it's used). */
const WhenPicker = lazyPart(() => import('@/features/when/WhenSheet').then((m) => m.WhenPicker));

/** Muted with no end: until they turn it back on. */
export const MUTED_FOR_GOOD = '9999-12-31T23:59:59.000Z';
const MORNING = '08:00';

export function MuteChoices({
  onMute,
  picking,
  onPicking,
}: {
  /** Until when, and how the toast says it. */
  onMute: (until: string, said: string) => void;
  /** Whether a day and time is being picked, in place of the spans. */
  picking: boolean;
  onPicking: (picking: boolean) => void;
}) {
  const { timeZone, locale } = useUserClock();
  const from = (ms: number) => new Date(Date.now() + ms).toISOString();
  // The next morning where they are: this one, while it's still night.
  const today = todayWhere(timeZone);
  const thisMorning = instantOf({ date: today, time: MORNING }, timeZone);
  const early = Date.now() < thisMorning.getTime();
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const morningAt = early
    ? thisMorning.toISOString()
    : instantOf({ date: nextDay, time: MORNING }, timeZone).toISOString();
  const time = formatTime(MORNING, locale);
  const morning = early ? tr('Until {time}', { time }) : tr('Until tomorrow, {time}', { time });
  const spans: Array<{ id: string; title: string; until: () => string; said: string }> = [
    {
      id: 'hour',
      title: tr('For an hour'),
      until: () => from(3_600_000),
      said: tr('Muted for an hour'),
    },
    {
      id: '8h',
      title: tr('For 8 hours'),
      until: () => from(8 * 3_600_000),
      said: tr('Muted for 8 hours'),
    },
    {
      id: 'morning',
      title: morning,
      until: () => morningAt,
      said: early
        ? tr('Muted until {time}', { time })
        : tr('Muted until tomorrow, {time}', { time }),
    },
    {
      id: 'week',
      title: tr('For a week'),
      until: () => from(7 * 86_400_000),
      said: tr('Muted for a week'),
    },
    {
      id: 'always',
      title: tr('Until I turn it back on'),
      until: () => MUTED_FOR_GOOD,
      said: tr('Muted'),
    },
  ];
  if (picking)
    return (
      <WhenPicker
        value={null}
        time="required"
        onCancel={() => onPicking(false)}
        onChange={(c: Chosen) => {
          const until = instantOf(c, timeZone);
          onMute(
            until.toISOString(),
            tr('Muted until {format}', {
              format: new Intl.DateTimeFormat(locale, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
                timeZone,
              }).format(until),
            }),
          );
        }}
        testID="mute-when"
      />
    );
  return (
    <>
      {spans.map((s) => (
        <ListRow
          key={s.id}
          icon={BellOff}
          title={s.title}
          onPress={() => onMute(s.until(), s.said)}
          testID={`mute-${s.id}`}
        />
      ))}
      <ListRow
        icon={CalendarClock}
        title={tr('Until a day and time…')}
        onPress={() => onPicking(true)}
        chevron
        testID="mute-until"
      />
    </>
  );
}
