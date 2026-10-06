import { tr } from '@caime/core/i18n';
import X from 'lucide-react-native/icons/x';
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
import { useReduceMotion } from '@/lib/motion';
import { useTheme } from '@/theme/theme';
import { IconButton } from './IconButton';
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
  // Less to move for whoever asked, in Appearance or on the device.
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  const layer = useId();
  useEffect(() => {
    if (!open) return;
    const { enter, leave } = useToastLayers.getState();
    enter(layer);
    return () => leave(layer);
  }, [open, layer]);
  // On the web a dialog closes on Escape (React Native Web's Modal doesn't do it for us), as
  // Android's back does through onRequestClose.
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <Modal
      visible={open}
      transparent
      animationType={reduceMotion ? 'none' : phone ? 'slide' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: phone ? 'flex-end' : 'center', alignItems: 'center' }}
      >
        <RNPressable
          accessibilityRole="button"
          accessibilityLabel={tr('Close')}
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
            // It gives way to the keyboard (iOS pads the space below by its height), so its title
            // and whatever's being typed in stay on screen, and what's inside scrolls.
            flexShrink: 1,
            backgroundColor: t.c.surface,
            borderTopStartRadius: t.radii.xxl,
            borderTopEndRadius: t.radii.xxl,
            borderBottomStartRadius: phone ? 0 : t.radii.xxl,
            borderBottomEndRadius: phone ? 0 : t.radii.xxl,
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
                paddingStart: 20,
                paddingEnd: 8,
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
              <IconButton icon={X} label={tr('Close')} onPress={onClose} />
            </View>
          ) : null}
          <Body
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={
              scroll ? { paddingHorizontal: 20, paddingVertical: 12, gap: 12 } : undefined
            }
            keyboardShouldPersistTaps="handled"
          >
            {scroll ? (
              children
            ) : (
              <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 12, flexShrink: 1 }}>
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
