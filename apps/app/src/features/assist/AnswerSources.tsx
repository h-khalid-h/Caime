/**
 * Where an answer's words came from (M17 I4): chips under a summary, an answer or a line of Cai's,
 * each a tap to the message it rests on (opened at its place), the action or the decision, a
 * moment of a call's notes, or a call's notes away from them (M17 I12a). Loaded apart wherever it's shown (`LAZY_EVERYWHERE`): the Ask and
 * catch-up panel, a brief, Cai's bubble and the notes sheet all draw it, none at first.
 */
import type { AnswerSourceView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/** One key per source: what it points at, never its place in the list. */
function keyOf(s: AnswerSourceView): string {
  switch (s.kind) {
    case 'message':
      return `message:${s.messageId}`;
    case 'note':
      return `note:${s.lineId}`;
    case 'call':
      return `call:${s.callId}:${s.lineId ?? 'notes'}`;
    default:
      return `${s.kind}:${s.id}`;
  }
}

/** Opens a source where it lives: the conversation at the message, else the actions. */
export function openSource(source: AnswerSourceView): void {
  if (source.kind === 'message') {
    router.navigate({
      pathname: '/c/[id]',
      params: { id: source.conversationId, seq: String(source.seq) },
    });
    return;
  }
  if (source.kind === 'note') return;
  // A call's notes (M17 I12a): opened from the call's line, at the line said where there is one.
  if (source.kind === 'call') {
    router.navigate({
      pathname: '/c/[id]',
      params: {
        id: source.conversationId,
        seq: String(source.seq),
        notes: source.callId,
        ...(source.lineId ? { line: source.lineId } : {}),
      },
    });
    return;
  }
  if (source.conversationId)
    router.navigate({ pathname: '/c/[id]', params: { id: source.conversationId } });
  else router.navigate('/actions');
}

function labelOf(source: AnswerSourceView): string {
  switch (source.kind) {
    case 'message':
      return source.title ? `${source.who} · ${source.title}` : source.who;
    case 'decision':
    case 'task':
      return source.title;
    case 'note':
      return source.speaker;
    case 'call':
      return source.lineId
        ? source.title
          ? `${source.who} · ${source.title}`
          : source.who
        : source.title
          ? `${tr('Notes from the call')} · ${source.title}`
          : tr('Notes from the call');
  }
}

export function AnswerSources({
  sources,
  onOpen,
  testID = 'answer-source',
}: {
  sources: AnswerSourceView[];
  /** Inside the conversation itself: jump to the line rather than navigate (the panel's `onJump`). */
  onOpen?: (source: AnswerSourceView) => void;
  testID?: string;
}) {
  const t = useTheme();
  if (sources.length === 0) return null;
  return (
    <View
      accessibilityRole="list"
      accessibilityLabel={tr('Where this comes from')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
    >
      {sources.map((s) => (
        <Pressable
          key={keyOf(s)}
          onPress={() => (onOpen ? onOpen(s) : openSource(s))}
          accessibilityRole="button"
          accessibilityLabel={tr('Open {title}', { title: labelOf(s) })}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: t.radii.md,
            backgroundColor: t.c.surface,
            maxWidth: 240,
          }}
          testID={testID}
        >
          <Text variant="captionStrong" numberOfLines={1} auto>
            {labelOf(s)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
