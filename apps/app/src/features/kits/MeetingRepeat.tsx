/**
 * A meeting that repeats (R58): agreed once, each time its own card. The time ahead offers "Stop
 * repeating", which ends the series with it (the server takes it only before the time ends);
 * a time where it was stopped says so. How often it repeats is the card's own line ("Repeats").
 */
import type { MessageView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { isRepeat } from '@caime/core/repeat';
import { seriesAgreed } from '@caime/core/series';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useNow } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

interface RepeatPayload {
  movedTo?: unknown;
  repeatStopped?: unknown;
  fields?: Record<string, unknown> | null;
}

/** When a time ends: its start and its length, else an hour; null without a start. */
function endOf(fields: Record<string, unknown> | null | undefined): number | null {
  const start = fields?.start as { at?: unknown } | undefined;
  const at = typeof start?.at === 'string' ? Date.parse(start.at) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  const minutes = Number(fields?.durationMinutes);
  return at + (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) * 60_000;
}

export function MeetingRepeat({ m, card }: { m: MessageView; card: RepeatPayload }) {
  const qc = useQueryClient();
  const now = useNow(60_000);
  const [busy, setBusy] = useState(false);
  if (m.deletedAt || card.movedTo) return null;
  if (card.repeatStopped)
    return (
      <Text variant="caption" color="textSecondary" testID="kit-repeat-stopped">
        {tr('Doesn’t repeat any more')}
      </Text>
    );
  const end = endOf(card.fields);
  if (!isRepeat(card.fields?.repeat) || !seriesAgreed(card) || end === null) return null;
  if (end <= now.getTime()) return null;
  const stop = async () => {
    setBusy(true);
    try {
      const res = await endpoints.stopRepeating(m.id);
      upsertMessage(qc, res.message);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flexDirection: 'row' }}>
      <Button
        label={tr('Stop repeating')}
        size="sm"
        variant="ghost"
        loading={busy}
        onPress={() => void stop()}
        testID="kit-stop-repeating"
      />
    </View>
  );
}
