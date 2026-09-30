import type { ConversationView } from '@caime/core/api';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { EmptyState } from '@/ui/EmptyState';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/**
 * The wedge's moment (PRD §87): a new connection, and nothing said yet. Three first lines,
 * fitted to how the person labelled the relationship, each a tap away from the box. Nothing is
 * sent by itself, and the lines use names, never pronouns (R27).
 */
export function FirstWords({
  conversation,
  onPick,
}: {
  conversation: ConversationView;
  onPick: (text: string) => void;
}) {
  const t = useTheme();
  const other = conversation.other;
  if (!other) return null;
  const first = other.person.displayName.split(/\s+/)[0] ?? other.person.displayName;
  const sphere = other.relationship?.sphere;
  const professional =
    sphere === 'work' ||
    sphere === 'professional' ||
    sphere === 'customer' ||
    sphere === 'vendor' ||
    sphere === 'service_provider' ||
    sphere === 'organization';
  const lines = professional
    ? [
        `Good to have you here, ${first}.`,
        'What are you working on this week?',
        'Shall we keep our threads here from now on?',
      ]
    : [`Hey ${first}! We\u2019re on Caime now.`, 'How have you been?', 'What\u2019s new with you?'];
  return (
    <View testID="first-words">
      <EmptyState
        compact
        character="momo"
        expression="happy"
        title={`Your first words with ${first}`}
        body={
          other.relationship
            ? `${other.relationship.label}: only you see that label. Say something, or pick a line to start from.`
            : 'Say something, or pick a line to start from.'
        }
        action={
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
          >
            {lines.map((line, n) => (
              <Pressable
                key={line}
                accessibilityRole="button"
                onPress={() => onPick(line)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: t.c.surfaceMuted,
                  borderWidth: 1,
                  borderColor: t.c.border,
                }}
                testID={`first-words-${n}`}
              >
                <Text variant="captionStrong">{line}</Text>
              </Pressable>
            ))}
          </View>
        }
      />
    </View>
  );
}
