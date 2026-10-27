/**
 * The chat beside a call (R121): its conversation, read from the inbox the app already keeps (the
 * row of the call's conversation: how much is unread, and its latest message), so nothing more is
 * asked of the server while a call is on. The Chat button among the call's controls carries the
 * count; what someone writes there while the call fills the screen shows over it for a few
 * seconds, and a tap on either opens the conversation with the call made small (`CallTile`).
 */
import { radii } from '@caime/brand/tokens';
import type { InboxAllResponse, InboxItemView } from '@caime/core/api';
import { messagePreview } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useMessages } from '@/api/hooks';
import { qk } from '@/api/keys';
import { flatMessages } from '@/state/cache';
import { useGroupCall } from '@/state/groupCall';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { OVER_VIDEO } from './callUi';

/** How long what someone just wrote stays over the call. */
const PEEK_MS = 6_000;

/**
 * The inbox's row of the call's conversation, kept fresh while the call is on (`enabled`): the
 * live events ask the inbox again for a message there, as they do whenever it's on screen.
 */
export function useCallChat(conversationId: string, enabled: boolean): InboxItemView | null {
  const select = useCallback(
    (d: InboxAllResponse) => d.conversations.find((c) => c.id === conversationId) ?? null,
    [conversationId],
  );
  const { data } = useQuery({
    queryKey: qk.inboxAll,
    queryFn: endpoints.inboxAll,
    select,
    enabled: enabled && Boolean(conversationId),
  });
  return enabled ? (data ?? null) : null;
}

/** What the call's Chat reads: how much is unread there, and its latest message. */
export type CallChatRow = Pick<InboxItemView, 'lastMessage' | 'unreadCount'>;

/**
 * A meeting's guest has no inbox (R84): the same from the conversation's own messages, which
 * their page keeps (M17 I13j), counting what others wrote since the call began and after the
 * last their page showed them (`chatSeenSeq`).
 */
export function useGuestCallChat(
  conversationId: string,
  enabled: boolean,
  me: string | undefined,
  since: string,
): CallChatRow | null {
  const { data } = useMessages(conversationId, enabled);
  const seen = useGroupCall((s) => s.chatSeenSeq);
  return useMemo(() => {
    if (!enabled || !data) return null;
    const all = flatMessages(data);
    const began = Date.parse(since);
    const unreadCount = all.filter(
      (m) =>
        m.seq > seen &&
        m.senderId !== me &&
        m.kind !== 'system' &&
        !m.deletedAt &&
        Date.parse(m.createdAt) >= began,
    ).length;
    const last = all.at(-1);
    return {
      unreadCount,
      lastMessage: last
        ? {
            id: last.id,
            seq: last.seq,
            senderId: last.senderId,
            kind: last.kind,
            preview: messagePreview({
              kind: last.kind,
              body: last.body,
              payload: last.payload,
              deleted: Boolean(last.deletedAt),
              sealed: last.sealed,
            }),
            mine: last.senderId === me,
            createdAt: last.createdAt,
          }
        : null,
    };
  }, [enabled, data, seen, me, since]);
}

/**
 * What someone else just wrote in the call's conversation (never one's own, never what was there
 * before the call began), over the call while it fills the screen; a tap opens the chat.
 */
export function ChatPeek({
  row,
  since,
  names,
  onOpen,
}: {
  row: CallChatRow | null;
  /** When the call began: anything older isn't news. */
  since: string;
  /** Who's who in the call, for the writer's name (left out for anyone else). */
  names: ReadonlyMap<string, string>;
  onOpen: () => void;
}) {
  const last = row?.lastMessage ?? null;
  const [shown, setShown] = useState<NonNullable<InboxItemView['lastMessage']> | null>(null);
  // The latest when the screen came up isn't news; only what arrives after it is.
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!row) return;
    const id = last?.id ?? null;
    if (seen.current === undefined) {
      seen.current = id;
      return;
    }
    if (!last || id === seen.current) return;
    seen.current = id;
    if (last.mine || last.kind === 'system' || Date.parse(last.createdAt) < Date.parse(since))
      return;
    setShown(last);
  }, [row, last, since]);
  useEffect(() => {
    if (!shown) return;
    const gone = setTimeout(() => setShown(null), PEEK_MS);
    return () => clearTimeout(gone);
  }, [shown]);
  const who = shown?.senderId ? names.get(shown.senderId) : undefined;
  return (
    // Said as it arrives, as a new message in an open conversation is.
    <View aria-live="polite" style={{ alignItems: 'center', paddingHorizontal: 16 }}>
      {shown ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={tr('Opens the chat')}
          onPress={onOpen}
          testID="call-chat-peek"
          style={{
            maxWidth: 440,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radii.lg,
            backgroundColor: '#FFFFFF29',
          }}
        >
          {who ? (
            <Text variant="captionStrong" style={{ color: '#FFFFFF', ...OVER_VIDEO }} auto>
              {who}
            </Text>
          ) : null}
          <Text
            variant="caption"
            style={{ color: '#FFFFFFEE', ...OVER_VIDEO }}
            numberOfLines={2}
            auto
          >
            {shown.preview}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
