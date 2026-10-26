/**
 * Under a call's line in its conversation, where Cai took notes in it (M16 F7): the way to what
 * was said. The sheet loads when it's opened; nothing of the calls comes with it. A meeting's
 * address opens it at once (`?notes=<call>`, M16 F6e).
 */
import { tr } from '@caime/core/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { lazyPart } from '@/ui/Lazy';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

const NotesSheet = lazyPart(() => import('./NotesSheet').then((m) => m.NotesSheet));

export function CallNotesLink({
  callId,
  conversationId,
}: {
  callId: string;
  /** The call's own conversation: never offered to share its recording into (M17 I13e). */
  conversationId: string;
}) {
  // Opened by a meeting's address once its notes are written (M16 F6e, `?notes=<call>`).
  const asked = useLocalSearchParams<{ notes?: string }>().notes === callId;
  const [open, setOpen] = useState(asked);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        hitSlop={8}
        testID="call-notes-open"
        style={{ paddingTop: 4 }}
      >
        <Text variant="caption" color="link" align="center">
          {tr('Notes from the call')}
        </Text>
      </Pressable>
      {open ? (
        <NotesSheet
          callId={callId}
          conversationId={conversationId}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
