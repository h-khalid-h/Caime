import type { MessageView } from '@caime/core/api';
import { formatClock } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { type LiveLocation, liveNow } from '@caime/core/location';
import { useQueryClient } from '@tanstack/react-query';
import MapPin from 'lucide-react-native/icons/map-pin';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useLiveShares } from '@/state/liveShares';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

interface Place {
  label?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  live?: LiveLocation;
}

/** "just now", "4 min ago": how fresh a live point is. */
function ago(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  return minutes < 1 ? tr('just now') : tr('{minutes} min ago', { minutes });
}

/**
 * A place in a message: where someone was, a place by name, or where they are, live, until the
 * time they chose (R29). The sharer can stop a live one from here.
 */
export function LocationBody({
  m,
  mine,
  fg,
  meta,
}: {
  m: MessageView;
  mine: boolean;
  fg: string;
  meta: string;
}) {
  const qc = useQueryClient();
  const now = useNow(15_000);
  const { timeZone, locale } = useUserClock();
  const [stopping, setStopping] = useState(false);
  const p = m.payload as Place;
  const point = typeof p.lat === 'number' && typeof p.lng === 'number';
  const url = point
    ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(p.label ?? '')}`;
  const live = p.live ?? null;
  const on = liveNow(live, now);
  const where = point
    ? p.accuracy
      ? tr('Within {accuracy} m · Open the map', { accuracy: p.accuracy })
      : tr('Open the map')
    : tr('Look it up on the map');
  const status = live
    ? on
      ? tr('Live until {formatClock} · updated {ago}', {
          formatClock: formatClock(live.until, timeZone, locale),
          ago: ago(live.updatedAt, now),
        })
      : live.stoppedAt
        ? tr('Shared live · stopped at {formatClock}', {
            formatClock: formatClock(live.stoppedAt, timeZone, locale),
          })
        : tr('Shared live until {formatClock}', {
            formatClock: formatClock(live.until, timeZone, locale),
          })
    : null;

  const stop = async () => {
    setStopping(true);
    try {
      upsertMessage(qc, (await endpoints.stopLocation(m.id)).message);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      useLiveShares.getState().end(m.id);
      setStopping(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={tr('{label}, open the map', {
          label: p.label ?? (live ? tr('A live location') : tr('A location')),
        })}
        onPress={() => openLink(url)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        testID="message-location"
      >
        <MapPin size={20} color={fg} />
        <View style={{ flexShrink: 1 }}>
          <Text variant="message" color={fg}>
            {p.label ??
              (live
                ? mine
                  ? tr('Your live location')
                  : tr('Live location')
                : mine
                  ? tr('Where you were')
                  : tr('Where they were'))}
          </Text>
          {status ? (
            <Text variant="captionStrong" color={on ? fg : meta} testID="location-live">
              {status}
            </Text>
          ) : null}
          <Text variant="caption" color={meta}>
            {where}
          </Text>
        </View>
      </Pressable>
      {mine && on ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void stop()}
          disabled={stopping}
          hitSlop={6}
          style={{ alignSelf: 'flex-start' }}
          testID="location-stop"
        >
          <Text variant="captionStrong" color={fg} style={{ textDecorationLine: 'underline' }}>
            {stopping ? tr('Stopping…') : tr('Stop sharing')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
