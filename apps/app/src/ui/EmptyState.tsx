import type { Character as CharacterName, Expression } from '@caime/brand/characters';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Character } from '@/brand/Character';
import type { IconComponent } from './Button';
import { Guide } from './Guide';
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
      {character && Icon ? (
        <Guide
          character={character}
          expression={expression}
          icon={Icon}
          size={compact ? 88 : 132}
        />
      ) : character ? (
        <Character name={character} expression={expression} size={compact ? 88 : 132} />
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
