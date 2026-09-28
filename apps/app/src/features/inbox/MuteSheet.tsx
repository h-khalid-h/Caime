/**
 * For how long a conversation keeps quiet: the spans people most often want, the next morning
 * where they are, until they turn it back on, or until a day and time they pick.
 */
import { useState } from 'react';
import { WhenSheet } from '@/features/when/WhenSheet';
import { type Chosen, instantOf, todayWhere } from '@/features/when/when';
import { useUserClock } from '@/lib/time';
import { BellOff, CalendarClock } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { formatTime } from '@/ui/times';

/** Muted with no end: until they turn it back on. */
export const MUTED_FOR_GOOD = '9999-12-31T23:59:59.000Z';
const MORNING = '08:00';

export function MuteSheet({
  open,
  onClose,
  onMute,
}: {
  open: boolean;
  onClose: () => void;
  /** Until when, and how the toast says it. */
  onMute: (until: string, said: string) => void;
}) {
  const { timeZone, locale } = useUserClock();
  const [picking, setPicking] = useState(false);
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
  const morning = `${early ? 'Until' : 'Until tomorrow,'} ${formatTime(MORNING, locale)}`;
  const choose = (until: string, said: string) => {
    onMute(until, said);
    onClose();
  };
  const spans: Array<{ id: string; title: string; until: () => string; said: string }> = [
    { id: 'hour', title: 'For an hour', until: () => from(3_600_000), said: 'Muted for an hour' },
    { id: '8h', title: 'For 8 hours', until: () => from(8 * 3_600_000), said: 'Muted for 8 hours' },
    {
      id: 'morning',
      title: morning,
      until: () => morningAt,
      said: `Muted ${morning.toLowerCase()}`,
    },
    {
      id: 'week',
      title: 'For a week',
      until: () => from(7 * 86_400_000),
      said: 'Muted for a week',
    },
    { id: 'always', title: 'Until I turn it back on', until: () => MUTED_FOR_GOOD, said: 'Muted' },
  ];
  return (
    <>
      <Sheet open={open && !picking} onClose={onClose} title="Mute notifications">
        {spans.map((s) => (
          <ListRow
            key={s.id}
            icon={BellOff}
            title={s.title}
            onPress={() => choose(s.until(), s.said)}
            testID={`mute-${s.id}`}
          />
        ))}
        <ListRow
          icon={CalendarClock}
          title="Until a day and time…"
          onPress={() => setPicking(true)}
          chevron
          testID="mute-until"
        />
      </Sheet>
      {picking ? (
        <WhenSheet
          open
          onClose={() => {
            setPicking(false);
            onClose();
          }}
          title="Mute until"
          value={null}
          time="required"
          onChange={(c: Chosen) => {
            const until = instantOf(c, timeZone);
            onMute(
              until.toISOString(),
              `Muted until ${new Intl.DateTimeFormat(locale, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
                timeZone,
              }).format(until)}`,
            );
          }}
          testID="mute-when"
        />
      ) : null}
    </>
  );
}
