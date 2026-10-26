/**
 * Under a call's line in its conversation, where Cai took notes in it (M16 F7): the way to what
 * was said. The sheet loads when it's opened; nothing of the calls comes with it. A meeting's
 * address opens it at once (`?notes=<call>`, M16 F6e), and what Search found at its line.
 */
import { tr } from '@caime/core/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
  // Opened by a meeting's address once its notes are written (M16 F6e, `?notes=<call>`), or by
  // what Search found said in it (M17 I12a, `&line=<line>`), at that line.
  const params = useLocalSearchParams<{ notes?: string; line?: string }>();
  const asked = params.notes === callId;
  const found = asked ? params.line : undefined;
  const [open, setOpen] = useState(asked);
  // Asked again while the conversation is on screen (another line found in this call).
  const askedFor = asked ? (found ?? 'notes') : null;
  useEffect(() => {
    if (askedFor) setOpen(true);
  }, [askedFor]);
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
          key={found ?? 'notes'}
          callId={callId}
          conversationId={conversationId}
          found={found}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
