import type { MessageView } from '@caime/core/api';
import { formatClock } from '@caime/core/format';
import { type LiveLocation, liveNow } from '@caime/core/location';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useLiveShares } from '@/state/liveShares';
import { MapPin } from '@/ui/icons';
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
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
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
      ? `Within ${p.accuracy} m · Open the map`
      : 'Open the map'
    : 'Look it up on the map';
  const status = live
    ? on
      ? `Live until ${formatClock(live.until, timeZone, locale)} · updated ${ago(live.updatedAt, now)}`
      : live.stoppedAt
        ? `Shared live · stopped at ${formatClock(live.stoppedAt, timeZone, locale)}`
        : `Shared live until ${formatClock(live.until, timeZone, locale)}`
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
        accessibilityLabel={`${p.label ?? (live ? 'A live location' : 'A location')}, open the map`}
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
                  ? 'Your live location'
                  : 'Live location'
                : mine
                  ? 'Where you were'
                  : 'Where they were')}
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
            {stopping ? 'Stopping…' : 'Stop sharing'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
