/**
 * A call's recording shared into this conversation (R114 (7), M17 I13e): a tile on the share's
 * message, playing the parts the sharer could, for whoever is in the conversation, while it's
 * kept; once the recording is gone, the share says so (and goes at the next sweep). Loaded by
 * the bubble when it draws one; the player loads with it.
 */
import type { CallRecordingPartView } from '@caime/core/api';
import { formatClock, formatDuration, formatWhenAt } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import { lazy, Suspense } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/Text';

const RecordingPlayer = lazy(() => import('./RecordingPlayer'));

function PartLine({ part, color }: { part: CallRecordingPartView; color: string }) {
  const { timeZone, locale } = useUserClock();
  const what =
    part.kind === 'screen'
      ? tr('Screen shown by {name}', { name: part.shownBy?.displayName ?? tr('Deleted account') })
      : tr('Everyone’s voices');
  const facts = [
    formatClock(part.startedAt, timeZone, locale),
    part.durationMs ? formatDuration(part.durationMs) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Text variant="caption" style={{ color }} testID="recording-share-part">
      {`${what} · ${facts}`}
    </Text>
  );
}

export default function RecordingShare({
  messageId,
  width,
  fg,
  meta,
}: {
  messageId: string;
  width: number;
  fg: string;
  meta: string;
}) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const share = useQuery({
    queryKey: qk.recordingShare(messageId),
    queryFn: () => endpoints.recordingShare(messageId),
    staleTime: 60_000,
  });
  const recording = share.data?.recording ?? null;
  const gone =
    (share.isError && share.error instanceof ApiError && share.error.status === 404) ||
    (share.data && (!recording || recording.state === 'deleted'));
  return (
    <View style={{ gap: 8, width }} testID="recording-share">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CircleDot size={13} color={gone ? meta : t.c.danger} />
        <Text variant="label" style={{ color: fg }} numberOfLines={1}>
          {share.data
            ? tr('Call recording · {when}', {
                when: formatWhenAt(share.data.callAt, true, now, timeZone, locale),
              })
            : tr('Call recording')}
        </Text>
      </View>
      {gone ? (
        <Text variant="caption" style={{ color: meta }} testID="recording-share-gone">
          {tr('The recording is gone.')}
        </Text>
      ) : share.isError ? (
        <Text variant="caption" style={{ color: meta }} testID="recording-share-failed">
          {(share.error as Error).message}
        </Text>
      ) : !recording ? (
        <Text variant="caption" style={{ color: meta }}>
          {tr('Loading…')}
        </Text>
      ) : (
        <>
          <Suspense fallback={null}>
            <RecordingPlayer parts={recording.parts} width={width} seek={null} />
          </Suspense>
          {recording.parts.map((part) => (
            <PartLine key={part.id} part={part} color={meta} />
          ))}
          {recording.until ? (
            <Text variant="caption" style={{ color: meta }} testID="recording-share-until">
              {tr('Kept until {day}, then deleted for everyone.', {
                day: formatWhenAt(recording.until, false, now, timeZone, locale),
              })}
            </Text>
          ) : recording.keptBy ? (
            <Text variant="caption" style={{ color: meta }}>
              {tr('Kept by {name}, against their storage.', {
                name: recording.keptBy.displayName,
              })}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
