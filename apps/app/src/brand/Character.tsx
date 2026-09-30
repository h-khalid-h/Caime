import type { Character as CharacterName, Expression } from '@caime/brand/characters';
import { memo, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

export interface CharacterProps {
  name: CharacterName;
  expression?: Expression;
  size?: number;
  accents?: boolean;
  /** Decorative by default; pass a label when the character carries meaning. */
  label?: string;
}

type Builders = typeof import('@caime/brand/characters');

/**
 * The vector builders, loaded the first time a character is drawn: they're for expressive
 * moments (a welcome, an empty state), not the first screen's shell, so they stay out of the
 * startup chunk (docs/RESOURCES.md). Once here, every character draws at once.
 */
let builders: Builders | null = null;
let loading: Promise<Builders> | null = null;
function loadBuilders(): Promise<Builders> {
  loading ??= import('@caime/brand/characters').then((m) => {
    builders = m;
    return m;
  });
  return loading;
}

/** A Caime Friend (BRAND.md B3), drawn from the brand package's vector builders. */
export const Character = memo(function Character({
  name,
  expression = 'happy',
  size = 120,
  accents = true,
  label,
}: CharacterProps) {
  const [ready, setReady] = useState(builders);
  useEffect(() => {
    if (ready) return;
    let on = true;
    void loadBuilders().then((m) => {
      if (on) setReady(m);
    });
    return () => {
      on = false;
    };
  }, [ready]);
  const xml = useMemo(
    () => ready?.characterSvg(name, { expression, accents, detail: size >= 48 }) ?? null,
    [ready, name, expression, accents, size],
  );
  return (
    <View
      accessible={Boolean(label)}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size }}
    >
      {xml ? <SvgXml xml={xml} width={size} height={size} /> : null}
    </View>
  );
});
