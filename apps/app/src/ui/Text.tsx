import { arabicType, type ThemeColors, type TypeStyleName } from '@caime/brand/tokens';
import { textDirection } from '@caime/core/format';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useRtl } from '@/lib/direction';
import { fontFace } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';

export interface TextProps extends RNTextProps {
  variant?: TypeStyleName;
  /** A theme colour name, or any colour. */
  color?: keyof ThemeColors | (string & {});
  weight?: 400 | 500 | 600 | 700 | 800 | 900;
  align?: TextStyle['textAlign'];
  /**
   * Set direction and alignment from the content (user-written text: names, messages). Pass the
   * text itself when the children are split into parts, as linkified messages are.
   */
  auto?: boolean | string;
}

const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/** Whether the children, where they are plain text, hold a letter written right to left. */
function hasRtl(children: unknown): boolean {
  if (typeof children === 'string') return RTL_CHARS.test(children);
  if (Array.isArray(children))
    return children.some((c) => typeof c === 'string' && RTL_CHARS.test(c));
  return false;
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
  const layoutRtl = useRtl();
  const spec = t.type[variant];
  const resolved = (t.c as unknown as Record<string, string>)[color] ?? color;
  const source =
    typeof auto === 'string' ? auto : auto && typeof children === 'string' ? children : undefined;
  const contentDir = source ? textDirection(source) : undefined;
  // Words with any Arabic in them run right to left: left to the browser's guess from the first
  // strong letter (`dir="auto"`), an Arabic sentence that opens with a Latin word ("Caime …")
  // runs left to right. Text without any (a handle, a date, "Egypt") keeps the browser's guess,
  // so "@handle" never turns into "handle@". User-written text passes `auto` and keeps its own.
  const arabic = hasRtl(source ?? children);
  const dir = contentDir ?? (arabic ? 'rtl' : undefined);
  // Where a line sits: user-written text by its own direction (an English message in an Arabic
  // Caime reads from the left of its bubble); the interface's words at the layout's start,
  // whatever letters they're in ("English" in the languages list sits at the right in Arabic),
  // and Arabic at the right wherever it is.
  const textAlign =
    align ??
    (auto
      ? contentDir === 'rtl'
        ? 'right'
        : undefined
      : layoutRtl || dir === 'rtl'
        ? 'right'
        : undefined);
  // Arabic takes the face paired with the family (a phone picks it here, a browser by the
  // letters), no tracking (its letters join) and a taller line (R73, `arabicType`).
  return (
    <RNText
      maxFontSizeMultiplier={MAX_SCALE[variant] ?? 1.8}
      {...rest}
      style={[
        {
          ...fontFace(spec.family, weight ?? spec.weight, arabic ? 'arabic' : 'latin'),
          fontSize: spec.size,
          lineHeight: arabic
            ? Math.round(spec.lineHeight * arabicType.lineHeightFactor)
            : spec.lineHeight,
          letterSpacing: arabic ? arabicType.letterSpacing : spec.letterSpacing,
          textTransform: spec.uppercase ? 'uppercase' : undefined,
          color: resolved,
          textAlign,
          writingDirection: dir,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
