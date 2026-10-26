/**
 * What the reader wrote here to be sent later (M16 E8b): a line above the composer while any
 * waits, and its sheet, each message with when it goes (or why it couldn't), Send now and
 * Delete. Theirs alone: nobody else in the conversation sees them until they're sent.
 */
import type { ScheduledMessageView } from '@caime/core/api';
import { formatWhenAt, previewText } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Clock from 'lucide-react-native/icons/clock';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export function ScheduledLine({
  conversationId,
  count,
}: {
  conversationId: string;
  count: number;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: qk.scheduled(conversationId),
    queryFn: () => endpoints.scheduled(conversationId),
    enabled: open,
  });
  const changed = () => {
    void qc.invalidateQueries({ queryKey: qk.scheduled(conversationId) });
    void qc.invalidateQueries({ queryKey: qk.conversation(conversationId) });
  };
  const act = async (work: () => Promise<unknown>, said: string) => {
    try {
      await work();
      toast(said);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
    changed();
  };
  const items: ScheduledMessageView[] = list.data?.scheduled ?? [];
  if (count === 0 && !open) return null;
  return (
    <>
      {count > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 6,
            marginHorizontal: 12,
            marginBottom: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: t.radii.sm,
            backgroundColor: t.c.surfaceMuted,
          }}
          testID="scheduled-line"
        >
          <Clock size={14} color={t.c.textSecondary} />
          <Text variant="captionStrong" color="textSecondary">
            {trn(count, '{n} message to send later', '{n} messages to send later')}
          </Text>
        </Pressable>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={tr('To send later')}>
        <View style={{ gap: 16 }} testID="scheduled-list">
          {list.isSuccess && items.length === 0 ? (
            <Text variant="body" color="textSecondary">
              {tr('Nothing waits to be sent here.')}
            </Text>
          ) : null}
          {items.map((m) => (
            <View key={m.id} style={{ gap: 8 }} testID={`scheduled-${m.id}`}>
              <Text variant="body" auto>
                {previewText(m.body, 200)}
              </Text>
              <Text variant="caption" color={m.failure ? 'danger' : 'textSecondary'}>
                {m.failure
                  ? tr('Couldn’t be sent: {reason}', { reason: m.failure })
                  : formatWhenAt(m.sendAt, true, now, timeZone, locale)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  label={m.failure ? tr('Try again') : tr('Send now')}
                  size="sm"
                  variant="secondary"
                  onPress={() => void act(() => endpoints.sendScheduledNow(m.id), tr('Sent'))}
                  testID="scheduled-send-now"
                />
                <Button
                  label={tr('Delete')}
                  size="sm"
                  variant="ghost"
                  onPress={() => void act(() => endpoints.unschedule(m.id), tr('Deleted'))}
                  testID="scheduled-delete"
                />
              </View>
            </View>
          ))}
        </View>
      </Sheet>
    </>
  );
}
