import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { useTheme } from '@/theme/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

interface ToastItem {
  id: number;
  message: string;
  tone: 'neutral' | 'danger' | 'success';
  action?: { label: string; onPress: () => void };
}

interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

let next = 1;
export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items.slice(-2), { ...t, id: next++ }] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

/**
 * Where toasts show: in the topmost open sheet, or on the screen when none is open. A sheet is a
 * modal (a layer above the app on the web, a window of its own on phones), so a toast drawn on
 * the screen beneath it would be hidden, and its Undo out of reach.
 */
export const useToastLayers = create<{
  open: string[];
  enter: (id: string) => void;
  leave: (id: string) => void;
}>((set) => ({
  open: [],
  enter: (id) => set((s) => ({ open: [...s.open.filter((i) => i !== id), id] })),
  leave: (id) => set((s) => ({ open: s.open.filter((i) => i !== id) })),
}));

export function toast(
  message: string,
  opts: { tone?: ToastItem['tone']; action?: ToastItem['action'] } = {},
): void {
  useToasts.getState().push({ message, tone: opts.tone ?? 'neutral', action: opts.action });
}

function ToastView({ item }: { item: ToastItem }) {
  const t = useTheme();
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.action ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [item, dismiss]);
  const bg = t.scheme === 'dark' ? t.c.surfaceRaised : t.c.ink;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        backgroundColor: item.tone === 'danger' ? t.c.danger : bg,
        borderRadius: t.radii.lg,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        maxWidth: 520,
        alignSelf: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
    >
      <Text variant="bodyStrong" color="#FFFFFF" style={{ flexShrink: 1 }}>
        {item.message}
      </Text>
      {item.action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            item.action?.onPress();
            dismiss(item.id);
          }}
          hitSlop={8}
        >
          <Text variant="label" color={t.c.accent}>
            {item.action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Without `layer`, the screen's; a sheet passes its own and shows them while it's on top. */
export function ToastHost({ layer }: { layer?: string }) {
  const items = useToasts((s) => s.items);
  const top = useToastLayers((s) => s.open[s.open.length - 1]);
  const insets = useSafeAreaInsets();
  if (items.length === 0 || top !== layer) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        start: 16,
        end: 16,
        top: insets.top + 12,
        gap: 8,
      }}
    >
      {items.map((i) => (
        <ToastView key={i.id} item={i} />
      ))}
    </View>
  );
}
