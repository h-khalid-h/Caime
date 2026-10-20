/**
 * The calendar feed (PRD §72): Apple Calendar or any calendar app reads your actions with a due
 * date and the meetings you agreed in Caime from a private address. Caime stays where they
 * change. The address is shown once, as it's made; a new one ends the old one. Google Calendar
 * and Outlook are better connected (R96: plans written as they change, busy times read), so it
 * says so; and while a connected account writes your plans, the feed leaves them to it (M16 F6),
 * so a calendar that shows both never shows one twice.
 */
import { ACCOUNT_BUSY_DAYS, ACCOUNT_PROVIDER_NAMES } from '@caime/core/accounts';
import type { CalendarFeedResponse } from '@caime/core/api';
import { formatWhen } from '@caime/core/format';
import { msg, tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { patchCache } from '@/state/cache';
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
  // A connected account that writes the plans (R96): the feed leaves meetings to it.
  const accounts = useQuery({
    queryKey: qk.accounts,
    queryFn: endpoints.accounts,
    enabled: !minor,
  }).data?.accounts;
  const writer = accounts?.find((a) => a.uses.includes('plans') && a.state !== 'reconnect');
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
      patchCache<CalendarFeedResponse>(qc, qk.calendarFeed, () => ({ feed: made.feed }));
      // On, it's a connected app (R74): Connected lists it, Discover says so.
      void qc.invalidateQueries({ queryKey: qk.connectedApps });
      void qc.invalidateQueries({ queryKey: qk.allDirectory });
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
      void qc.invalidateQueries({ queryKey: qk.connectedApps });
      void qc.invalidateQueries({ queryKey: qk.allDirectory });
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
      <Text variant="caption" color="textSecondary" testID="calendar-feed-accounts">
        {writer
          ? tr(
              'Your {provider} calendar gets your meetings and appointments from your connected account as they change, so this feed carries your actions’ due dates, and what’s more than {days} days ahead.',
              { provider: ACCOUNT_PROVIDER_NAMES[writer.provider], days: ACCOUNT_BUSY_DAYS },
            )
          : tr(
              'Using Google Calendar or Outlook? Connect the account under Your accounts instead: Caime writes your plans there as they change, and keeps bookings off your busy times.',
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
          {tr('On since {when} · {text}', {
            when: formatWhen(feed.createdAt ?? '', now, timeZone, locale),
            text: feed.lastReadAt
              ? tr('last read {when}', { when: formatWhen(feed.lastReadAt, now, timeZone, locale) })
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
