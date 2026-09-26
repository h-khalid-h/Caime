import { type ReactNode, useEffect, useId } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable as RNPressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { IconButton } from './IconButton';
import { X } from './icons';
import { useLayout } from './layout';
import { Text } from './Text';
import { ToastHost, useToastLayers } from './Toast';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Widest the dialog gets on large screens. */
  maxWidth?: number;
  scroll?: boolean;
}

/** A bottom sheet on phones, a centred dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 520,
  scroll = true,
}: SheetProps) {
  const t = useTheme();
  const { phone, height } = useLayout();
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  const layer = useId();
  useEffect(() => {
    if (!open) return;
    const { enter, leave } = useToastLayers.getState();
    enter(layer);
    return () => leave(layer);
  }, [open, layer]);
  return (
    <Modal
      visible={open}
      transparent
      animationType={phone ? 'slide' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: phone ? 'flex-end' : 'center', alignItems: 'center' }}
      >
        <RNPressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: t.c.scrim,
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: phone ? undefined : maxWidth,
            maxHeight: phone ? height * 0.92 : height * 0.86,
            backgroundColor: t.c.surface,
            borderTopLeftRadius: t.radii.xxl,
            borderTopRightRadius: t.radii.xxl,
            borderBottomLeftRadius: phone ? 0 : t.radii.xxl,
            borderBottomRightRadius: phone ? 0 : t.radii.xxl,
            paddingBottom: phone ? Math.max(insets.bottom, 12) : 12,
            overflow: 'hidden',
          }}
        >
          {phone ? (
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View
                style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.c.borderStrong }}
              />
            </View>
          ) : null}
          {title ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 20,
                paddingRight: 8,
                paddingTop: 10,
                paddingBottom: 4,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="headline" accessibilityRole="header">
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="caption" color="textSecondary">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <IconButton icon={X} label="Close" onPress={onClose} />
            </View>
          ) : null}
          <Body
            style={{ flexGrow: 0 }}
            contentContainerStyle={
              scroll ? { paddingHorizontal: 20, paddingVertical: 12, gap: 12 } : undefined
            }
            keyboardShouldPersistTaps="handled"
          >
            {scroll ? (
              children
            ) : (
              <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}>
                {children}
              </View>
            )}
          </Body>
          {footer ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 8 }}>{footer}</View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      <ToastHost layer={layer} />
    </Modal>
  );
}
