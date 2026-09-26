import type { MessageView } from '@caishy/core/api';
import { previewText } from '@caishy/core/format';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { translate } from '@/features/assist/translations';
import { patchMessage, removeMessage } from '@/state/cache';
import { useTheme } from '@/theme/theme';
import { Copy, CornerUpLeft, Flag, Languages, ListChecks, Pencil, Trash } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

export async function toggleReaction(
  qc: ReturnType<typeof useQueryClient>,
  m: MessageView,
  emoji: string,
  me: string,
) {
  const existing = m.reactions.find((r) => r.emoji === emoji);
  const mine = Boolean(existing?.mine);
  // Optimistic: flip it now, the server's event confirms it.
  patchMessage(qc, m.conversationId, m.id, (x) => {
    const others = x.reactions.filter((r) => r.emoji !== emoji);
    const ids = new Set(existing?.userIds ?? []);
    if (mine) ids.delete(me);
    else ids.add(me);
    if (ids.size === 0) return { ...x, reactions: others };
    const next = { emoji, count: ids.size, mine: !mine, userIds: [...ids] };
    return {
      ...x,
      reactions: existing
        ? x.reactions.map((r) => (r.emoji === emoji ? next : r))
        : [...x.reactions, next],
    };
  });
  try {
    if (mine) await endpoints.unreact(m.id, emoji);
    else await endpoints.react(m.id, emoji);
  } catch (e) {
    toast((e as Error).message, { tone: 'danger' });
  }
}

export function MessageActions({
  m,
  me,
  onClose,
  onReply,
  onEdit,
  aiReady,
}: {
  m: MessageView | null;
  me: string;
  onClose: () => void;
  onReply: (m: MessageView) => void;
  onEdit: (m: MessageView) => void;
  /** AI assist is on and may read this conversation: offer to translate. */
  aiReady?: boolean;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  if (!m) return null;
  const mine = m.senderId === me;
  const deleted = m.deletedAt !== null;
  const text = m.body ?? '';
  const close = (fn: () => void | Promise<void>) => () => {
    onClose();
    void fn();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={mine ? 'Your message' : 'Message'}
      subtitle={text ? previewText(text, 80) : undefined}
    >
      {!deleted ? (
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}
          accessibilityRole="toolbar"
        >
          {QUICK_REACTIONS.map((emoji) => {
            const chosen = m.reactions.some((r) => r.emoji === emoji && r.mine);
            return (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}`}
                accessibilityState={{ selected: chosen }}
                onPress={close(() => toggleReaction(qc, m, emoji, me))}
                haptic
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: chosen ? t.c.accentSoft : t.c.surfaceMuted,
                }}
              >
                <Text style={{ fontSize: 24, lineHeight: 30 }} maxFontSizeMultiplier={1}>
                  {emoji}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={{ marginHorizontal: -20 }}>
        {!deleted ? (
          <ListRow icon={CornerUpLeft} title="Reply" onPress={close(() => onReply(m))} />
        ) : null}
        {text && !deleted ? (
          <ListRow
            icon={Copy}
            title="Copy text"
            onPress={close(async () => {
              await Clipboard.setStringAsync(text);
              toast('Copied');
            })}
          />
        ) : null}
        {aiReady && !mine && !deleted && text ? (
          <ListRow
            icon={Languages}
            title="Translate"
            subtitle="Into your language, suggested by Caishy"
            onPress={close(() => translate(m.id))}
            testID="message-translate"
          />
        ) : null}
        {!deleted && text ? (
          <ListRow
            icon={ListChecks}
            title="Add to my actions"
            subtitle="Keeps a link back to this message"
            onPress={close(async () => {
              try {
                await endpoints.createTask({
                  title: previewText(text, 120),
                  conversationId: m.conversationId,
                  messageId: m.id,
                });
                toast('Added to your actions');
                void qc.invalidateQueries({ queryKey: ['tasks'] });
              } catch (e) {
                toast((e as Error).message, { tone: 'danger' });
              }
            })}
          />
        ) : null}
        {mine && m.kind === 'text' && !deleted ? (
          <ListRow icon={Pencil} title="Edit" onPress={close(() => onEdit(m))} />
        ) : null}
        {mine && !deleted ? (
          <ListRow
            icon={Trash}
            title="Delete for everyone"
            destructive
            onPress={close(async () => {
              try {
                await endpoints.deleteMessage(m.id, true);
                patchMessage(qc, m.conversationId, m.id, (x) => ({
                  ...x,
                  body: null,
                  files: [],
                  deletedAt: new Date().toISOString(),
                }));
              } catch (e) {
                toast((e as Error).message, { tone: 'danger' });
              }
            })}
          />
        ) : null}
        <ListRow
          icon={Trash}
          title="Delete for me"
          destructive={!mine}
          onPress={close(async () => {
            try {
              await endpoints.deleteMessage(m.id, false);
              removeMessage(qc, m.conversationId, m.id);
            } catch (e) {
              toast((e as Error).message, { tone: 'danger' });
            }
          })}
        />
        {!mine && m.senderId ? (
          <ListRow
            icon={Flag}
            title="Report"
            subtitle="Sends this message to Caishy’s safety team"
            destructive
            onPress={close(async () => {
              try {
                await endpoints.report({
                  messageId: m.id,
                  conversationId: m.conversationId,
                  userId: m.senderId ?? undefined,
                  reason: 'other',
                });
                toast('Reported. Thank you for keeping Caishy safe.');
              } catch (e) {
                toast((e as Error).message, { tone: 'danger' });
              }
            })}
          />
        ) : null}
      </View>
    </Sheet>
  );
}
