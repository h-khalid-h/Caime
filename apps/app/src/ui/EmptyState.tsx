import type { Character as CharacterName, Expression } from '@caishy/brand/characters';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Character } from '@/brand/Character';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Playful shows the character; Minimal shows the icon instead. */
  character?: CharacterName;
  expression?: Expression;
  icon?: IconComponent;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  title,
  body,
  character,
  expression,
  icon: Icon,
  action,
  compact,
}: EmptyStateProps) {
  const t = useTheme();
  const showCharacter = character && (t.playful || !Icon);
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingVertical: compact ? 20 : 40,
        gap: 12,
        maxWidth: 420,
        alignSelf: 'center',
      }}
    >
      {showCharacter ? (
        <Character name={character} expression={expression} size={compact ? 88 : 132} />
      ) : Icon ? (
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: t.c.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={28} color={t.c.textSecondary} />
        </View>
      ) : null}
      <Text variant="headline" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="textSecondary" align="center">
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}
