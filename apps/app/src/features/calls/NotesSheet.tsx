/**
 * What was said in a call while Cai took notes (M16 F7, R82 (3)), loaded when it's opened from
 * the call's line: speaker by speaker, as each was heard, from when the reader joined (R85 (2)).
 * Each person may delete their own words; the others keep theirs. Nothing is drawn from it on its
 * own: it's what was said, and that's all.
 */
import type { CallNoteLineView } from '@caime/core/api';
import { formatClock } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Trash from 'lucide-react-native/icons/trash';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { EmptyState } from '@/ui/EmptyState';
import { lazyPart } from '@/ui/Lazy';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const LoadFailed = lazyPart(() => import('@/ui/LoadFailed').then((m) => m.LoadFailed));

export function NotesSheet({
  callId,
  open,
  onClose,
}: {
  callId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const { timeZone, locale } = useUserClock();
  const notes = useQuery({
    queryKey: qk.callNotes(callId),
    queryFn: () => endpoints.callNotes(callId),
    enabled: open,
  });
  const lines = notes.data?.lines ?? [];
  const writing = lines.filter((l) => l.text === null).length;
  const remove = async (line: CallNoteLineView) => {
    try {
      await endpoints.deleteCallNoteLine(callId, line.id);
      await qc.invalidateQueries({ queryKey: qk.callNotes(callId) });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('Notes from the call')}
      subtitle={tr(
        'Written by Cai from what was said, under each person’s name. Voices weren’t kept. You can delete your own words.',
      )}
    >
      {notes.isPending ? (
        <SkeletonRows count={4} />
      ) : notes.isError && !notes.data ? (
        <LoadFailed
          title={tr('The notes couldn’t load')}
          error={notes.error}
          onRetry={() => void notes.refetch()}
        />
      ) : lines.length === 0 ? (
        <EmptyState
          title={tr('Nothing was said while Cai took notes')}
          body={tr('Words that are still being written show here once they are.')}
        />
      ) : (
        <View style={{ gap: 14 }} testID="call-notes-lines">
          {lines.map((l) => (
            <View
              key={l.id}
              style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
              testID="call-notes-line"
            >
              <Avatar
                id={l.speaker.id}
                name={l.speaker.displayName}
                url={l.speaker.avatarUrl}
                size={32}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                  <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {l.mine ? tr('You') : l.speaker.displayName}
                  </Text>
                  <Text variant="caption" color="textTertiary">
                    {formatClock(l.at, timeZone, locale)}
                  </Text>
                </View>
                <Text
                  variant="body"
                  color={l.text === null ? 'textTertiary' : 'text'}
                  auto={l.text !== null}
                  selectable
                >
                  {l.text ?? tr('Cai is still writing this…')}
                </Text>
              </View>
              {l.mine ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('Delete my words')}
                  onPress={() => void remove(l)}
                  hitSlop={8}
                  testID="call-notes-delete"
                >
                  <Trash size={18} color={t.c.textTertiary} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {writing ? (
            <Text variant="caption" color="textTertiary">
              {trn(
                writing,
                'Cai is still writing one of these.',
                'Cai is still writing {n} of these.',
              )}
            </Text>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
