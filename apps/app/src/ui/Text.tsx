import type { ThemeColors, TypeStyleName } from '@caime/brand/tokens';
import { textDirection } from '@caime/core/format';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { fontFamily } from '@/theme/fonts';
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

const RTL_CHARS = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
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
  const spec = t.type[variant];
  const resolved = (t.c as unknown as Record<string, string>)[color] ?? color;
  const source =
    typeof auto === 'string' ? auto : auto && typeof children === 'string' ? children : undefined;
  const contentDir = source ? textDirection(source) : undefined;
  // Words with any Arabic in them run right to left: left to the browser's guess from the first
  // strong letter (`dir="auto"`), an Arabic sentence that opens with a Latin word ("Caime …")
  // runs left to right. Text without any (a handle, a date, "Egypt") keeps the browser's guess,
  // so "@handle" never turns into "handle@". User-written text passes `auto` and keeps its own.
  const dir = contentDir ?? (hasRtl(children) ? 'rtl' : undefined);
  return (
    <RNText
      maxFontSizeMultiplier={MAX_SCALE[variant] ?? 1.8}
      {...rest}
      style={[
        {
          fontFamily: fontFamily(spec.family, weight ?? spec.weight),
          // A system face carries its weight as a style; ours carry it in the file's name.
          fontWeight:
            spec.family === 'mono'
              ? (String(weight ?? spec.weight) as TextStyle['fontWeight'])
              : undefined,
          fontSize: spec.size,
          lineHeight: spec.lineHeight,
          letterSpacing: spec.letterSpacing,
          textTransform: spec.uppercase ? 'uppercase' : undefined,
          color: resolved,
          textAlign: align ?? (contentDir === 'rtl' ? 'right' : undefined),
          writingDirection: dir,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
