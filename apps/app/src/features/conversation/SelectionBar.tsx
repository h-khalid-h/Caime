/**
 * Several messages chosen together (M16 E8): the bar that takes the composer's place while
 * choosing, saying how many, with what can be done to all of them at once. Copy puts their words
 * on the clipboard in the order they were said (one message's words alone; several, each under
 * who said it), never a private message's, whose words are opened one at a time; Forward is
 * offered only where every one of them may be forwarded; Delete for me takes them all with one
 * Undo. Cancel ends the choosing, as letting go of the last one does.
 */
import type { MessageView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import Copy from 'lucide-react-native/icons/copy';
import Trash from 'lucide-react-native/icons/trash';
import X from 'lucide-react-native/icons/x';
import { View } from 'react-native';
import { copyText } from '@/lib/clipboard';
import { useTheme } from '@/theme/theme';
import { Forward } from '@/ui/directional';
import { IconButton } from '@/ui/IconButton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** The words several messages put on the clipboard, in the order they were said. */
export function chosenText(ms: MessageView[], names: Map<string, string>): string {
  const said = ms
    .filter((m) => !m.sealed && m.body)
    .sort((a, b) => a.seq - b.seq)
    .map((m) => ({ who: (m.senderId && names.get(m.senderId)) || '', words: m.body ?? '' }));
  if (said.length === 1) return said[0]?.words ?? '';
  return said.map(({ who, words }) => (who ? `${who}: ${words}` : words)).join('\n');
}

export function SelectionBar({
  chosen,
  names,
  forwardable,
  onCancel,
  onForward,
  onDelete,
}: {
  chosen: MessageView[];
  names: Map<string, string>;
  /** Every one of them may be forwarded, from a conversation that isn't private. */
  forwardable: boolean;
  onCancel: () => void;
  onForward: () => void;
  onDelete: () => void;
}) {
  const t = useTheme();
  const words = chosenText(chosen, names);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: t.c.border,
        backgroundColor: t.c.surface,
      }}
      accessibilityRole="toolbar"
      testID="selection-bar"
    >
      <IconButton icon={X} label={tr('Cancel')} onPress={onCancel} testID="select-cancel" />
      <Text
        variant="bodyStrong"
        style={{ flex: 1 }}
        accessibilityLiveRegion="polite"
        testID="select-count"
      >
        {trn(chosen.length, '{n} selected', '{n} selected')}
      </Text>
      {words && !chosen.some((m) => m.sealed) ? (
        <IconButton
          icon={Copy}
          label={tr('Copy text')}
          onPress={async () => {
            await copyText(words);
            toast(tr('Copied'));
            onCancel();
          }}
          testID="select-copy"
        />
      ) : null}
      {forwardable ? (
        <IconButton
          icon={Forward}
          label={tr('Forward')}
          onPress={onForward}
          testID="select-forward"
        />
      ) : null}
      <IconButton
        icon={Trash}
        label={tr('Delete for me')}
        onPress={onDelete}
        testID="select-delete"
      />
    </View>
  );
}
