import type { ConversationView } from '@caishy/core/api';
import { joinNames } from '@caishy/core/format';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { typingIn, useLive } from '@/state/live';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/Text';

export function useTypingNames(conversation: ConversationView | undefined): string[] {
  const [, tick] = useState(0);
  const ids = useLive((s) => (conversation ? typingIn(s, conversation.id).join(',') : ''));
  // Re-check every second so an expired "typing" disappears without a new event.
  useEffect(() => {
    if (!ids) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [ids]);
  if (!conversation || !ids) return [];
  const live = typingIn(useLive.getState(), conversation.id);
  return live
    .map((id) => conversation.participants.find((p) => p.userId === id)?.person.displayName)
    .filter((n): n is string => Boolean(n));
}

export function TypingIndicator({ names }: { names: string[] }) {
  const t = useTheme();
  if (names.length === 0) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: 3,
          backgroundColor: t.c.bubbleOther,
          borderRadius: 12,
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}
      >
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: t.c.textTertiary,
              opacity: 0.5 + i * 0.2,
            }}
          />
        ))}
      </View>
      <Text variant="caption" color="textSecondary">
        {names.length === 1 ? `${names[0]} is typing…` : `${joinNames(names)} are typing…`}
      </Text>
    </View>
  );
}
