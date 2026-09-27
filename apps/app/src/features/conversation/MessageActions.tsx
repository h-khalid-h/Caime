import type { MessageView } from '@caishy/core/api';
import { previewText } from '@caishy/core/format';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { translate } from '@/features/assist/translations';
import { useOpened } from '@/features/e2ee/hooks';
import { SaveSheet } from '@/features/saved/SaveSheet';
import { patchMessage, removeMessage } from '@/state/cache';
import { useTaskOutbox } from '@/state/taskOutbox';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import {
  Bookmark,
  Copy,
  CornerUpLeft,
  Flag,
  Forward,
  Languages,
  ListChecks,
  Pencil,
  Pin,
  PinOff,
  Star,
  Trash,
} from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** A decision's longest title (the server's). */
const DECISION_MAX = 300;

export const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

/**
 * What can be forwarded (the server's rule): not a private message, a line about the
 * conversation, a card, a poll or a live location, which stay where they were shared.
 */
function forwardable(m: MessageView): boolean {
  if (m.sealed) return false;
  if (m.kind === 'location') return !(m.payload as { live?: unknown }).live;
  return ['text', 'media', 'file', 'voice', 'sticker', 'contact'].includes(m.kind);
}

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
  where,
  moderator = false,
  canPin = false,
  onForward,
}: {
  m: MessageView | null;
  me: string;
  onClose: () => void;
  onReply: (m: MessageView) => void;
  onEdit: (m: MessageView) => void;
  /** AI assist is on and may read this conversation: offer to translate. */
  aiReady?: boolean;
  /** The conversation shown, and whether it's private (R18). */
  where: { conversationId: string; private: boolean };
  /** A group's owner or admin: they take down anyone's message, for everyone (PRD §56). */
  moderator?: boolean;
  /** They may pin messages here (core pins.ts). */
  canPin?: boolean;
  /** Forward it to other conversations (never from a private one). */
  onForward?: (m: MessageView) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  // A private message's words, as opened here: to copy, never to send anywhere (R18).
  const opened = useOpened(m, where);
  // Saving it as a decision (PRD §30): its words to start from, for this message only.
  const [deciding, setDeciding] = useState<{ id: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Keeping it in a collection of theirs (PRD §69), for this message only.
  const [keeping, setKeeping] = useState<string | null>(null);
  if (!m) return null;
  const decision = deciding?.id === m.id ? deciding.title : null;
  const dismiss = () => {
    setDeciding(null);
    setKeeping(null);
    onClose();
  };
  const mine = m.senderId === me;
  const deleted = m.deletedAt !== null;
  // What Caishy may read (translate, find a task in): never a private message's words.
  const text = m.sealed ? '' : (m.body ?? '');
  const shown = m.sealed ? (opened.text ?? '') : text;
  const close = (fn: () => void | Promise<void>) => () => {
    dismiss();
    void fn();
  };
  const saveDecision = async (title: string) => {
    setSaving(true);
    try {
      await endpoints.createDecision({
        conversationId: m.conversationId,
        title,
        messageId: m.id,
      });
      toast('Decision saved');
      void qc.invalidateQueries({ queryKey: ['decisions'] });
      void qc.invalidateQueries({ queryKey: ['memory'] });
      dismiss();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };
  if (keeping === m.id) return <SaveSheet message={m} onClose={dismiss} />;
  if (decision !== null)
    return (
      <Sheet
        open
        onClose={dismiss}
        title="Save as a decision"
        subtitle="Everyone in this conversation sees it, with a link back to the message."
        footer={
          <Button
            label="Save decision"
            block
            size="lg"
            loading={saving}
            disabled={!decision.trim()}
            onPress={() => void saveDecision(decision.trim())}
            testID="decision-save"
          />
        }
      >
        <TextField
          label="The decision"
          value={decision}
          onChangeText={(title) => setDeciding({ id: m.id, title })}
          maxLength={DECISION_MAX}
          multiline
          autoFocus
          testID="decision-title"
        />
      </Sheet>
    );
  return (
    <Sheet
      open
      onClose={dismiss}
      title={mine ? 'Your message' : 'Message'}
      subtitle={shown ? previewText(shown, 80) : undefined}
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
        {shown && !deleted ? (
          <ListRow
            icon={Copy}
            title="Copy text"
            onPress={close(async () => {
              await Clipboard.setStringAsync(shown);
              toast('Copied');
            })}
            testID="message-copy"
          />
        ) : null}
        {onForward && forwardable(m) && !where.private && !deleted ? (
          <ListRow
            icon={Forward}
            title="Forward"
            onPress={close(() => onForward(m))}
            testID="message-forward"
          />
        ) : null}
        {/* Kept only where Caishy can read it: never a private message, nor a line about it. */}
        {!deleted && !where.private && !m.sealed && m.kind !== 'system' ? (
          <ListRow
            icon={Bookmark}
            title="Save"
            subtitle="Keep it in a collection of yours"
            onPress={() => setKeeping(m.id)}
            testID="message-save"
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
            onPress={close(() => {
              useTaskOutbox.getState().add({
                title: previewText(text, 120),
                conversationId: m.conversationId,
                messageId: m.id,
              });
              toast(
                onlineManager.isOnline()
                  ? 'Added to your actions'
                  : 'Added to your actions. It’s saved when you’re back online.',
              );
            })}
          />
        ) : null}
        {!deleted && text ? (
          <ListRow
            icon={Star}
            title="Save as a decision"
            subtitle="Everyone here sees it, with a link back to this message"
            onPress={() => setDeciding({ id: m.id, title: previewText(text, DECISION_MAX) })}
            testID="message-decision"
          />
        ) : null}
        {canPin && m.kind !== 'system' && !deleted ? (
          <ListRow
            icon={m.pinnedAt ? PinOff : Pin}
            title={m.pinnedAt ? 'Unpin' : 'Pin'}
            subtitle={m.pinnedAt ? undefined : 'Keeps it at the top for everyone here'}
            testID="message-pin"
            onPress={close(async () => {
              try {
                if (m.pinnedAt) await endpoints.unpin(m.id);
                else await endpoints.pin(m.id);
                toast(m.pinnedAt ? 'Unpinned' : 'Pinned');
                void qc.invalidateQueries({ queryKey: qk.pins(m.conversationId) });
              } catch (e) {
                toast((e as Error).message, { tone: 'danger' });
              }
            })}
          />
        ) : null}
        {mine && m.kind === 'text' && !deleted ? (
          <ListRow icon={Pencil} title="Edit" onPress={close(() => onEdit(m))} />
        ) : null}
        {/* A line about the conversation stays for everyone, whoever's line it is. */}
        {(mine || moderator) && m.kind !== 'system' && !deleted ? (
          <ListRow
            icon={Trash}
            title="Delete for everyone"
            subtitle={mine ? undefined : 'As one of the group’s admins'}
            destructive
            testID="message-delete-everyone"
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
