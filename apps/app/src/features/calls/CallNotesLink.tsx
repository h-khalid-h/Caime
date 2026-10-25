/**
 * Under a call's line in its conversation, where Cai took notes in it (M16 F7): the way to what
 * was said. The sheet loads when it's opened; nothing of the calls comes with it.
 */
import { tr } from '@caime/core/i18n';
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
  const [open, setOpen] = useState(false);
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
