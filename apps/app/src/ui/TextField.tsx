import { controlHeight } from '@caime/brand/tokens';
import { tr } from '@caime/core/i18n';
import { forwardRef, useState } from 'react';
import { TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';
import { fontFace } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from './Button';
import { Eye, EyeOff } from './icons';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconComponent;
  /** Password field with a show/hide toggle. */
  secret?: boolean;
  style?: ViewStyle;
  /** Shown at the end of the field (a check mark, a counter). */
  trailing?: React.ReactNode;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, icon: Icon, secret, style, trailing, onFocus, onBlur, ...input },
  ref,
) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const border = error ? t.c.danger : focused ? t.c.focus : t.c.border;
  const body = t.type.body;
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant="captionStrong" color="textSecondary" nativeID={input.nativeID}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: controlHeight.field,
          borderRadius: t.radii.md,
          borderWidth: focused || error ? 2 : 1,
          borderColor: border,
          backgroundColor: t.c.surface,
          paddingHorizontal: focused || error ? 13 : 14,
          gap: 10,
        }}
      >
        {Icon ? <Icon size={18} color={t.c.textTertiary} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={t.c.textTertiary}
          secureTextEntry={secret && !shown}
          autoCorrect={secret ? false : input.autoCorrect}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              minHeight: 46,
              color: t.c.text,
              ...fontFace(body.family, body.weight),
              fontSize: 16,
              paddingVertical: 10,
            },
            // No second focus outline on the web: the field's border is the ring.
            { outlineStyle: 'none' } as object,
          ]}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? tr('Hide password') : tr('Show password')}
            onPress={() => setShown((v) => !v)}
            hitSlop={10}
          >
            {shown ? (
              <EyeOff size={18} color={t.c.textSecondary} />
            ) : (
              <Eye size={18} color={t.c.textSecondary} />
            )}
          </Pressable>
        ) : null}
        {trailing}
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textTertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
