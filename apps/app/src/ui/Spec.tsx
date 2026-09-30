import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

export interface SpecRow {
  /** The label, as a spec sheet writes it: short, sentence case, in mono. */
  label: string;
  /** Words, or something drawn (a verified line, a link). */
  value: ReactNode;
  testID?: string;
}

/**
 * A spec sheet (BRAND.md): a mono label and its value on each line, hairlines between. How
 * Caime states facts about a person, an organization or itself, wherever a card would list
 * them. Rows that are null or false are left out, so a caller lists what may be there.
 */
export function Spec({
  rows,
  dense = false,
  hairlines = true,
  style,
  ...rest
}: {
  rows: Array<SpecRow | null | false | undefined>;
  /** Smaller values (a screen's own lines, not someone's facts). */
  dense?: boolean;
  hairlines?: boolean;
} & ViewProps) {
  const t = useTheme();
  const shown = rows.filter((r): r is SpecRow => Boolean(r));
  return (
    <View
      {...rest}
      style={[hairlines ? { borderTopWidth: 1, borderTopColor: t.c.border } : null, style]}
    >
      {shown.map((r) => {
        const words = typeof r.value === 'string' ? r.value : null;
        return (
          <View
            key={r.label}
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingVertical: dense ? 7 : 8,
              borderBottomWidth: hairlines ? 1 : 0,
              borderBottomColor: t.c.border,
            }}
            accessible={words !== null}
            accessibilityLabel={words !== null ? `${r.label}: ${words}` : undefined}
            testID={r.testID}
          >
            <Text variant="mono" color="textTertiary" style={{ width: 96, paddingTop: 2 }}>
              {r.label}
            </Text>
            {words !== null ? (
              <Text
                variant={dense ? 'caption' : 'body'}
                color={dense ? 'textSecondary' : 'text'}
                style={{ flex: 1 }}
                auto
              >
                {words}
              </Text>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center' }}>{r.value}</View>
            )}
          </View>
        );
      })}
    </View>
  );
}
