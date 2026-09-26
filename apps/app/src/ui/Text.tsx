import type { ThemeColors, TypeStyleName } from '@caishy/brand/tokens';
import { textDirection } from '@caishy/core/format';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';

export interface TextProps extends RNTextProps {
  variant?: TypeStyleName;
  /** A theme colour name, or any colour. */
  color?: keyof ThemeColors | (string & {});
  weight?: 400 | 500 | 600 | 700 | 800 | 900;
  align?: TextStyle['textAlign'];
  /** Set direction and alignment from the content (user-written text: names, messages). */
  auto?: boolean;
}

/** Headings stop growing sooner than body text so layouts survive large accessibility sizes. */
const MAX_SCALE: Partial<Record<TypeStyleName, number>> = {
  display: 1.3,
  title: 1.3,
  headline: 1.4,
  overline: 1.4,
};

export function Text({
  variant = 'body',
  color = 'text',
  weight,
  align,
  auto,
  style,
  children,
  ...rest
}: TextProps) {
  const t = useTheme();
  const spec = t.type[variant];
  const resolved = (t.c as unknown as Record<string, string>)[color] ?? color;
  const dir = auto && typeof children === 'string' ? textDirection(children) : undefined;
  return (
    <RNText
      maxFontSizeMultiplier={MAX_SCALE[variant] ?? 1.8}
      {...rest}
      style={[
        {
          fontFamily: fontFamily(spec.family, weight ?? spec.weight),
          fontSize: spec.size,
          lineHeight: spec.lineHeight,
          letterSpacing: spec.letterSpacing,
          textTransform: spec.uppercase ? 'uppercase' : undefined,
          color: resolved,
          textAlign: align ?? (dir === 'rtl' ? 'right' : undefined),
          writingDirection: dir,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
