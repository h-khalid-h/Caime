import type { Character as CharacterName, Expression } from '@caime/brand/characters';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { MessageCircle } from '@/ui/icons';

/** The desktop detail pane before something is chosen. */
export function DetailPlaceholder({
  character,
  expression,
  title,
  body,
  action,
  icon = MessageCircle,
}: {
  character?: CharacterName;
  expression?: Expression;
  title: string;
  body?: string;
  action?: ReactNode;
  /** Shown instead of the character in the Minimal style. */
  icon?: IconComponent;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.c.canvas,
      }}
    >
      <EmptyState
        character={character}
        expression={expression}
        icon={icon}
        title={title}
        body={body}
        action={action}
      />
    </View>
  );
}
