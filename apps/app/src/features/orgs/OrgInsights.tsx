import type { MoneyTotal, OrgCommerceView } from '@caime/core/api';
import { replyTimeText } from '@caime/core/business';
import { formatAmount, formatClock } from '@caime/core/format';
import { listed, tr, trn } from '@caime/core/i18n';
import { dateFormat } from '@caime/core/locale';
import { useQuery } from '@tanstack/react-query';
import ChartBar from 'lucide-react-native/icons/chart-no-axes-column';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';

/** A Sunday, for naming the days of the week from. */
const A_SUNDAY = Date.UTC(2023, 0, 1);
const DAY_MS = 86_400_000;
/** How tall the busiest hour's bar is. */
const BARS_HIGH = 36;

/**
 * Against the period before, in words read at a glance: "Up from 3", "Same as before". A sum of
 * money passes how it's written, so "Up from EGP 3,000" reads as money.
 */
function versus(now: number, before: number, shown?: (n: number) => string): string | null {
  if (now === before) return before ? tr('Same as before') : null;
  const was = shown ? shown(before) : before;
  return now > before
    ? tr('Up from {before}', { before: was })
    : tr('Down from {before}', { before: was });
}

/** The busiest of a row of counts: its place, the first of equals. */
const peak = (counts: number[]) =>
  counts.reduce((best, n, i) => (n > (counts[best] ?? 0) ? i : best), 0);

function Stat({
  label,
  value,
  detail,
  note,
  testID,
}: {
  label: string;
  value: string;
  detail?: string | null;
  /** A second line under the detail: how it compares, or what it counts. */
  note?: string | null;
  testID: string;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 140,
        padding: 12,
        gap: 2,
        borderRadius: t.radii.md,
        backgroundColor: t.c.surfaceMuted,
      }}
      testID={testID}
    >
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text variant="headline">{value}</Text>
      {detail ? (
        <Text variant="caption" color="textTertiary">
          {detail}
        </Text>
      ) : null}
      {note ? (
        <Text variant="caption" color="textTertiary">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * What the conversations came to (M16 H4): bookings and where they stand, orders and what they
 * come to, what the organization was paid, who bought and who came back, what was booked or
 * ordered most, and when customers write on the organization's clock.
 */
function Commerce({ c }: { c: OrgCommerceView }) {
  const t = useTheme();
  const { locale } = useUserClock();
  const money = (m: MoneyTotal) => formatAmount(m.value, m.currency, locale);
  const nothing =
    !c.bookings.made &&
    !c.orders.placed &&
    !c.paid.length &&
    !c.previous.bookings &&
    !c.previous.orders &&
    !c.previous.paid.length;
  const [mainPaid, ...otherPaid] = c.paid;
  const paidBefore = mainPaid
    ? (c.previous.paid.find((p) => p.currency === mainPaid.currency)?.value ?? 0)
    : 0;
  const written = c.byHour.reduce((a, b) => a + b, 0);
  const busiest = Math.max(...c.byHour, 1);
  const hour = peak(c.byHour);
  const clock = (h: number) =>
    formatClock(new Date(Date.UTC(2023, 0, 1, h)).toISOString(), 'UTC', locale);
  const when = written
    ? tr('Most often on {day}, around {time}', {
        day: dateFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
          new Date(A_SUNDAY + peak(c.byWeekday) * DAY_MS),
        ),
        time: clock(hour),
      })
    : null;
  return (
    <View style={{ gap: 10 }} testID="insight-commerce">
      <Text variant="label">{tr('Booked, ordered and paid')}</Text>
      {nothing ? (
        <Text variant="caption" color="textTertiary">
          {tr(
            'Nothing booked, ordered or paid yet. Bookings, orders and Pay cards in customers’ conversations show here.',
          )}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat
            label={tr('Bookings')}
            value={String(c.bookings.made)}
            detail={
              listed([
                c.bookings.confirmed
                  ? trn(c.bookings.confirmed, 'One confirmed', '{n} confirmed')
                  : null,
                c.bookings.requested
                  ? trn(
                      c.bookings.requested,
                      'One waiting for an answer',
                      '{n} waiting for an answer',
                    )
                  : null,
                c.bookings.cancelled
                  ? trn(c.bookings.cancelled, 'One cancelled', '{n} cancelled')
                  : null,
              ]) || null
            }
            note={versus(c.bookings.made, c.previous.bookings)}
            testID="insight-bookings"
          />
          <Stat
            label={tr('Orders')}
            value={String(c.orders.placed)}
            detail={
              c.orders.value.length
                ? tr('Worth {amount}', { amount: listed(c.orders.value.map(money)) })
                : null
            }
            note={versus(c.orders.placed, c.previous.orders)}
            testID="insight-orders"
          />
          <Stat
            label={tr('Paid')}
            value={mainPaid ? money(mainPaid) : '—'}
            detail={otherPaid.length ? listed(otherPaid.map(money)) : null}
            note={
              !mainPaid
                ? tr('Pay cards and invoices marked paid')
                : paidBefore
                  ? versus(mainPaid.value, paidBefore, (n) => money({ ...mainPaid, value: n }))
                  : null
            }
            testID="insight-paid"
          />
          <Stat
            label={tr('Customers who booked or ordered')}
            value={String(c.customers.bought)}
            detail={
              c.customers.wrote ? tr('Of {count} who wrote', { count: c.customers.wrote }) : null
            }
            testID="insight-bought"
          />
        </View>
      )}
      {c.top.length ? (
        <View style={{ gap: 4 }} testID="insight-top">
          <Text variant="caption" color="textSecondary">
            {tr('Booked or ordered most')}
          </Text>
          {c.top.map((x) => (
            <View key={x.name} style={{ flexDirection: 'row', gap: 12 }}>
              <Text variant="body" auto numberOfLines={1} style={{ flex: 1 }}>
                {x.name}
              </Text>
              <Text variant="body" color="textSecondary">
                {String(x.count)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {when ? (
        <View style={{ gap: 6 }}>
          <Text variant="caption" color="textSecondary">
            {tr('When customers write')}
          </Text>
          <Text variant="body" testID="insight-busiest">
            {when}
          </Text>
          {/* Each hour of the day, the busiest marked; read out as the line above. */}
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={when}
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: BARS_HIGH }}
            testID="insight-hours"
          >
            {c.byHour.map((n, h) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: an hour of the day is its place
                key={h}
                style={{
                  flex: 1,
                  height: Math.max(2, Math.round((n / busiest) * BARS_HIGH)),
                  borderRadius: 2,
                  backgroundColor: h === hour ? t.c.accent : t.c.border,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[0, 12, 23].map((h) => (
              <Text key={h} variant="caption" color="textTertiary">
                {clock(h)}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * How the inbox is doing (PRD §71), for owners and admins on Business: how many customers wrote,
 * how fast the team answered, who's waiting, what's resolved, and what it all came to. The team
 * as a whole, never a person.
 */
export function OrgInsights({ orgId }: { orgId: string }) {
  const t = useTheme();
  const [days, setDays] = useState<'7' | '30'>('7');
  const q = useQuery({
    queryKey: qk.orgInsights(orgId, Number(days)),
    queryFn: () => endpoints.orgInsights(orgId, days === '7' ? 7 : 30),
  });
  const i = q.data?.insights;
  return (
    <Card>
      <View style={{ gap: 14 }} testID="org-insights">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ChartBar size={20} color={t.c.textSecondary} />
          <Text variant="label" style={{ flex: 1 }}>
            {tr('Insights')}
          </Text>
          <View style={{ flexShrink: 0, width: 180 }}>
            <Segmented
              value={days}
              onChange={setDays}
              label={tr('Period')}
              options={[
                { value: '7', label: trn(7, '{n} day', '{n} days') },
                { value: '30', label: trn(30, '{n} day', '{n} days') },
              ]}
            />
          </View>
        </View>
        {i ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Stat
                label={tr('Customers')}
                value={String(i.conversations)}
                detail={versus(i.conversations, i.previous.conversations)}
                note={
                  i.commerce.customers.returning
                    ? trn(i.commerce.customers.returning, 'One returning', '{n} returning')
                    : null
                }
                testID="insight-conversations"
              />
              <Stat
                label={tr('First answer')}
                value={i.reply.medianMinutes === null ? '—' : replyTimeText(i.reply.medianMinutes)}
                detail={
                  i.reply.answered
                    ? tr('{withinHour} of {answered} within an hour', {
                        withinHour: i.reply.withinHour,
                        answered: i.reply.answered,
                      })
                    : tr('Nothing answered yet')
                }
                testID="insight-reply"
              />
              <Stat
                label={tr('Waiting now')}
                value={String(i.waitingNow)}
                detail={i.waitingNow ? tr('For someone on the team') : tr('Nobody')}
                testID="insight-waiting"
              />
              <Stat
                label={tr('Resolved')}
                value={String(i.resolved)}
                detail={versus(i.resolved, i.previous.resolved)}
                testID="insight-resolved"
              />
            </View>
            <Commerce c={i.commerce} />
          </>
        ) : (
          <Text variant="caption" color="textTertiary">
            {q.isError ? tr('Insights didn’t load. Try again in a moment.') : tr('Loading…')}
          </Text>
        )}
        <Text variant="caption" color="textTertiary">
          {tr(
            'The whole team’s numbers, never one person’s. Answers from an app’s bot don’t count.',
          )}
        </Text>
        <Text variant="caption" color="textTertiary">
          {tr('Money is what Pay cards and invoices say was paid: Caime never holds it.')}
        </Text>
      </View>
    </Card>
  );
}
