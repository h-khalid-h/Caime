/**
 * What a conversation keeps pinned at its top (PRD §22, §56). The bar shows one pinned message;
 * tapping it goes to that message, and the bar moves on to the next one, when there are several.
 * Whoever may pin takes the one shown down from here. A private conversation's pinned messages
 * are opened here, on this device, like any of its messages (R18).
 */
import type { MessageView } from '@caime/core/api';
import { messagePreview } from '@caime/core/format';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { usePins } from '@/api/hooks';
import { qk } from '@/api/keys';
import { readAs, useOpened } from '@/features/e2ee/hooks';
import { useTheme } from '@/theme/theme';
import { IconButton } from '@/ui/IconButton';
import { Pin, PinOff } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export function PinnedBar({
  where,
  canUnpin,
  onJump,
}: {
  /** The conversation shown, and whether it's private (R18). */
  where: { conversationId: string; private: boolean };
  /** They may take pins down (either person in a one-to-one, a group's owner and admins). */
  canUnpin: boolean;
  /** Go to a message in the conversation. */
  onJump: (m: MessageView) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  // What isn't sealed in a private conversation isn't shown there (R18), at its top neither.
  const pins = (usePins(where.conversationId).data?.messages ?? []).filter(
    (p) => readAs(p, where) !== 'unverified',
  );
  const [at, setAt] = useState(0);
  const i = pins.length ? at % pins.length : 0;
  const m = pins[i];
  const opened = useOpened(m, where);
  if (!m) return null;
  const words = m.sealed
    ? (opened.text ?? opened.note ?? 'Private message')
    : messagePreview({ kind: m.kind, body: m.body, payload: m.payload, deleted: false });
  const which = pins.length > 1 ? `Pinned, ${i + 1} of ${pins.length}` : 'Pinned';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingStart: 12,
        paddingEnd: 4,
        borderBottomWidth: 1,
        borderBottomColor: t.c.border,
        backgroundColor: t.c.surface,
      }}
      testID="pinned-bar"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${which}: ${words}`}
        accessibilityHint={pins.length > 1 ? 'Goes to it, then shows the next one' : 'Goes to it'}
        onPress={() => {
          onJump(m);
          setAt(i + 1);
        }}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <Pin size={16} color={t.c.accentStrong} />
        <View style={{ flex: 1, minWidth: 0, paddingVertical: 8 }}>
          <Text variant="captionStrong" color="accentStrong">
            {which}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {words}
          </Text>
        </View>
      </Pressable>
      {canUnpin ? (
        <IconButton
          icon={PinOff}
          label="Unpin this message"
          size={18}
          onPress={() =>
            void (async () => {
              try {
                await endpoints.unpin(m.id);
                void qc.invalidateQueries({ queryKey: qk.pins(where.conversationId) });
                toast('Unpinned');
              } catch (e) {
                toast((e as Error).message, { tone: 'danger' });
              }
            })()
          }
          testID="pinned-unpin"
        />
      ) : null}
    </View>
  );
}
