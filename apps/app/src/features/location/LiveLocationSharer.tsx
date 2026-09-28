import { formatClock } from '@caime/core/format';
import { useQueryClient } from '@tanstack/react-query';
import type { LocationSubscription } from 'expo-location';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useNow, useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useLiveShares } from '@/state/liveShares';
import { useTheme } from '@/theme/theme';
import { MapPin } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** How often the people watching hear where you are, at most (the server allows every 2 s). */
const EVERY_MS = 3_000;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

type Point = { lat: number; lng: number; accuracy?: number };

/**
 * Keeps this device's live locations moving while Caime is open (R29), and says so on screen
 * for as long as any is live, with a way to stop. A share that ended elsewhere, or ran out, lets go.
 */
export function LiveLocationSharer() {
  const t = useTheme();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { desktop } = useLayout();
  const { timeZone, locale } = useUserClock();
  const shares = useLiveShares((s) => s.shares);
  const now = useNow(15_000);
  const [stopping, setStopping] = useState(false);
  const active = Object.entries(shares).filter(([, s]) => Date.parse(s.until) > now.getTime());
  const ids = active
    .map(([id]) => id)
    .sort()
    .join(',');

  // Ones that ran out go.
  useEffect(() => {
    for (const [id, s] of Object.entries(shares))
      if (Date.parse(s.until) <= now.getTime()) useLiveShares.getState().end(id);
  }, [shares, now]);

  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    let watcher: LocationSubscription | null = null;
    let pending: Point | null = null;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const send = async () => {
      timer = null;
      const point = pending;
      pending = null;
      if (!point || cancelled) return;
      last = Date.now();
      for (const id of ids.split(',')) {
        try {
          upsertMessage(qc, (await endpoints.moveLocation(id, point)).message);
        } catch (e) {
          // Ended, stopped elsewhere, or gone: nothing more to send for it.
          if (e instanceof ApiError && e.status !== 429 && e.status < 500)
            useLiveShares.getState().end(id);
        }
      }
    };
    const heard = (point: Point) => {
      pending = point;
      if (timer) return;
      timer = setTimeout(() => void send(), Math.max(0, last + EVERY_MS - Date.now()));
    };
    void (async () => {
      // Loaded only once something is shared live: most people never do.
      const Location = await import('expo-location');
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: EVERY_MS, distanceInterval: 10 },
        ({ coords }) =>
          heard({
            lat: round(coords.latitude),
            lng: round(coords.longitude),
            ...(coords.accuracy ? { accuracy: Math.round(coords.accuracy) } : {}),
          }),
      );
      if (cancelled) sub.remove();
      else watcher = sub;
    })();
    return () => {
      cancelled = true;
      watcher?.remove();
      if (timer) clearTimeout(timer);
    };
  }, [ids, qc]);

  if (!active.length) return null;
  const until = active.map(([, s]) => s.until).sort()[active.length - 1] ?? '';
  const stop = async () => {
    setStopping(true);
    for (const [id] of active) {
      try {
        upsertMessage(qc, (await endpoints.stopLocation(id)).message);
      } catch (e) {
        if (!(e instanceof ApiError)) {
          toast('Couldn’t stop it just now. Try again.', { tone: 'danger' });
          setStopping(false);
          return;
        }
      }
      useLiveShares.getState().end(id);
    }
    setStopping(false);
  };
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: desktop ? 96 : 16,
        right: desktop ? undefined : 16,
        ...(desktop ? { bottom: 20 } : { top: insets.top + 64 }),
        alignItems: desktop ? 'flex-start' : 'center',
      }}
    >
      <View
        accessibilityRole="alert"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingLeft: 14,
          paddingRight: 6,
          paddingVertical: 6,
          borderRadius: 999,
          // As a toast is: dark on a light theme, raised on a dark one.
          backgroundColor: t.scheme === 'dark' ? t.c.surfaceRaised : t.c.ink,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
        testID="live-location-sharing"
      >
        <MapPin size={16} color={t.c.accent} />
        <Text variant="captionStrong" color="#FFFFFF">
          {`Sharing your location live · until ${formatClock(until, timeZone, locale)}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stop sharing your location"
          disabled={stopping}
          onPress={() => void stop()}
          hitSlop={8}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.14)',
          }}
          testID="live-location-stop"
        >
          <Text variant="captionStrong" color="#FFFFFF">
            {stopping ? 'Stopping…' : 'Stop'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
