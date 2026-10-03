/**
 * Your calendar (PRD §72): Google Calendar, Outlook or Apple Calendar reads your actions with a
 * due date and the meetings you agreed in Caime from a private address. Caime stays where they
 * change. The address is shown once, as it's made; a new one ends the old one.
 */
import { formatWhen } from '@caime/core/format';
import { msg, tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { CopyRow } from '@/ui/CopyRow';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const HOW = msg(
  'Google Calendar: Other calendars, then From URL. Outlook: Add calendar, then Subscribe from web. Apple Calendar: File, then New Calendar Subscription.',
);

export function CalendarFeed() {
  const qc = useQueryClient();
  const minor = useSession((s) => s.user?.minor ?? false);
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const q = useQuery({
    queryKey: qk.calendarFeed,
    queryFn: endpoints.calendarFeed,
    enabled: !minor,
  });
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'make' | 'stop' | null>(null);
  const [confirming, setConfirming] = useState<'replace' | 'stop' | null>(null);
  const feed = q.data?.feed;

  const make = async () => {
    setBusy('make');
    try {
      const made = await endpoints.newCalendarFeed();
      setUrl(made.url);
      setConfirming(null);
      qc.setQueryData(qk.calendarFeed, { feed: made.feed });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const stop = async () => {
    setBusy('stop');
    try {
      await endpoints.stopCalendarFeed();
      setUrl(null);
      setConfirming(null);
      void qc.invalidateQueries({ queryKey: qk.calendarFeed });
      toast(tr('Your calendar won’t read Caime any more'));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  if (minor)
    return (
      <Text variant="body" color="textSecondary" style={{ padding: 16 }}>
        {tr('Calendars are for people over 18.')}
      </Text>
    );
  if (q.isPending) return <SkeletonRows count={2} />;
  return (
    <View style={{ padding: 16, gap: 12 }} testID="calendar-feed">
      <Text variant="body" color="textSecondary">
        {tr(
          'See your actions’ due dates and the meetings you agree to in Google Calendar, Outlook or Apple Calendar. They read a private address; nothing changes in Caime from there.',
        )}
      </Text>
      {url ? (
        <View style={{ gap: 8 }}>
          <CopyRow label={tr('Calendar address')} value={url} testID="calendar-feed-url" />
          <Text variant="caption" color="textTertiary">
            {tr('Shown this once: add it to your calendar now. {how}', { how: tr(HOW) })}
          </Text>
          <Button
            label={tr('Open in your calendar app')}
            variant="secondary"
            size="sm"
            onPress={() => openLink(url.replace(/^https?:/, 'webcal:'))}
          />
        </View>
      ) : feed?.enabled ? (
        <Text variant="caption" color="textSecondary" testID="calendar-feed-on">
          {tr('On since {formatWhen} · {text}', {
            formatWhen: formatWhen(feed.createdAt ?? '', now, timeZone, locale),
            text: feed.lastReadAt
              ? `last read ${formatWhen(feed.lastReadAt, now, timeZone, locale)}`
              : tr('not read yet'),
          })}
        </Text>
      ) : null}
      {confirming ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption" color="textSecondary">
            {confirming === 'replace'
              ? tr('The address your calendar has now stops working, and you add the new one.')
              : tr('Your calendar stops showing what’s in Caime.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              label={confirming === 'replace' ? tr('Get a new address') : tr('Stop it')}
              variant={confirming === 'stop' ? 'danger' : 'primary'}
              size="sm"
              loading={busy !== null}
              onPress={() => void (confirming === 'replace' ? make() : stop())}
              testID="calendar-feed-confirm"
              style={{ flex: 1 }}
            />
            <Button
              label={tr('Keep it')}
              variant="secondary"
              size="sm"
              onPress={() => setConfirming(null)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : feed?.enabled ? (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button
            label={tr('Get a new address')}
            variant="secondary"
            size="sm"
            onPress={() => setConfirming('replace')}
            testID="calendar-feed-replace"
          />
          <Button
            label={tr('Stop')}
            variant="ghost"
            size="sm"
            onPress={() => setConfirming('stop')}
            testID="calendar-feed-stop"
          />
        </View>
      ) : (
        <Button
          label={tr('Get a calendar address')}
          size="sm"
          loading={busy === 'make'}
          onPress={() => void make()}
          testID="calendar-feed-make"
        />
      )}
    </View>
  );
}
