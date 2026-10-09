import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoneBar } from '@/state/phoneBar';
import { useSession } from '@/state/session';
import { useLayout } from '@/ui/layout';
import { ToastHost } from '@/ui/Toast';
import { TAB_BAR_HEIGHT, tabBarRoom } from '@/ui/tabBarHeight';

/**
 * The screen's toasts: above the phone's bar of places while it's shown; where it steps aside
 * (a conversation) as far up, clear of the composer; at the bottom signed out and on a desktop.
 */
export function ScreenToasts() {
  const { phone } = useLayout();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const bar = usePhoneBar((s) => s.shown);
  const insets = useSafeAreaInsets();
  return (
    <ToastHost above={bar ? tabBarRoom(insets.bottom) : phone && signedIn ? TAB_BAR_HEIGHT : 0} />
  );
}
