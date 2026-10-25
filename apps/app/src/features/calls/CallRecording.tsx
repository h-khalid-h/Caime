/**
 * A call's recording beside its notes (R114, M17 I13b), for whoever was in the call when each
 * part began: everyone's voices, and each screen shown, each played where it is (the browser's
 * player, a phone's own), until when it's kept, and Delete for everyone (R52), asked once more
 * before it goes. The notes stay when it does.
 */
import type { CallRecordingPartView, CallRecordingView } from '@caime/core/api';
import { formatClock, formatDuration, formatWhenAt } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import { lazy, Suspense, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const RecordingPlayer = lazy(() => import('./RecordingPlayer'));

/** What a part is, and how it stands while it isn't ready to play. */
function PartRow({ part }: { part: CallRecordingPartView }) {
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
    <View style={{ gap: 6 }} testID="call-recording-part">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
        <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
          {what}
        </Text>
        <Text variant="caption" color="textTertiary">
          {facts}
        </Text>
      </View>
      {part.state === 'ready' ? null : (
        <Text variant="caption" color="textTertiary" testID={`call-recording-${part.state}`}>
          {part.state === 'failed'
            ? tr('This part couldn’t be kept.')
            : part.state === 'finishing'
              ? tr('Getting it ready to play…')
              : tr('Being recorded…')}
        </Text>
      )}
    </View>
  );
}

export function CallRecording({
  callId,
  recording,
  seek,
}: {
  callId: string;
  recording: CallRecordingView;
  /** A moment a line of the notes asked to play from (M17 I13c). */
  seek: { at: string; n: number } | null;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const { width } = useWindowDimensions();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const playerWidth = Math.min(480, width - 64);
  const remove = async () => {
    setDeleting(true);
    try {
      await endpoints.deleteCallRecording(callId);
      toast(tr('The recording was deleted for everyone.'));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setDeleting(false);
      setConfirming(false);
      await qc.invalidateQueries({ queryKey: qk.callNotes(callId) });
    }
  };
  if (recording.state === 'deleted')
    return (
      <Text variant="caption" color="textTertiary" testID="call-recording-deleted">
        {tr('The recording was deleted. The notes stay.')}
      </Text>
    );
  return (
    <View
      testID="call-recording"
      style={{ padding: 12, borderRadius: t.radii.md, gap: 12, backgroundColor: t.c.surfaceMuted }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CircleDot size={13} color={t.c.danger} />
        <Text variant="overline" color="textSecondary">
          {recording.state === 'recording' ? tr('Being recorded') : tr('Recording')}
        </Text>
      </View>
      <Suspense fallback={null}>
        <RecordingPlayer parts={recording.parts} width={playerWidth} seek={seek} />
      </Suspense>
      {recording.parts.map((part) => (
        <PartRow key={part.id} part={part} />
      ))}
      {recording.until ? (
        <Text variant="caption" color="textTertiary" testID="call-recording-until">
          {tr('Kept until {day}, then deleted for everyone.', {
            day: formatWhenAt(recording.until, false, now, timeZone, locale),
          })}
        </Text>
      ) : null}
      {confirming ? (
        <View style={{ gap: 8 }}>
          <Text variant="body">
            {tr('Delete the recording for everyone who was in the call? The notes stay.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              label={tr('Delete for everyone')}
              size="sm"
              variant="danger"
              loading={deleting}
              onPress={() => void remove()}
              testID="call-recording-delete-confirm"
            />
            <Button
              label={tr('Keep it')}
              size="sm"
              variant="secondary"
              disabled={deleting}
              onPress={() => setConfirming(false)}
              testID="call-recording-delete-cancel"
            />
          </View>
        </View>
      ) : (
        <Button
          label={tr('Delete the recording')}
          size="sm"
          variant="secondary"
          onPress={() => setConfirming(true)}
          testID="call-recording-delete"
        />
      )}
    </View>
  );
}
