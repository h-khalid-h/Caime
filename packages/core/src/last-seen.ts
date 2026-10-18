/**
 * "Last seen" (M16 E3), apart from format.ts: only a conversation's head reads it, and format.ts
 * is in the first download (it took the startup chunk to 450.0 KB there).
 */
import { formatClock } from './format';
import { tr } from './i18n';
import { dateFormat } from './locale';
import { zonedParts } from './time';

const sameDay = (
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number },
) => a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * When someone was last on Caime, as a conversation's head says it (M16 E3): "Last seen today at
 * 14:05", "yesterday at 9:12", "Tuesday at 18:30", "12 October". Whole sentences, so each language
 * orders the day and the time its own way, and none of them takes the person's gender. Empty for
 * a time that isn't one: a device's bad value never breaks the head.
 */
export function lastSeenLine(iso: string, now: Date, timeZone: string, locale = 'en'): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return '';
  const diff = now.getTime() - t.getTime();
  if (diff < 60_000) return tr('Last seen just now');
  const time = formatClock(iso, timeZone, locale);
  const p = zonedParts(t, timeZone);
  const n = zonedParts(now, timeZone);
  if (sameDay(p, n)) return tr('Last seen today at {time}', { time });
  const y = new Date(Date.UTC(n.year, n.month - 1, n.day - 1));
  if (sameDay(p, { year: y.getUTCFullYear(), month: y.getUTCMonth() + 1, day: y.getUTCDate() }))
    return tr('Last seen yesterday at {time}', { time });
  if (diff < 6 * 86_400_000)
    return tr('Last seen {weekday} at {time}', {
      weekday: dateFormat(locale, { weekday: 'long', timeZone }).format(t),
      time,
    });
  return tr('Last seen {date}', {
    date: dateFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: p.year === n.year ? undefined : 'numeric',
      timeZone,
    }).format(t),
  });
}
