import { useSession } from '@/state/session';
import { useLayout } from '@/ui/layout';
import { ToastHost } from '@/ui/Toast';
import { TAB_BAR_HEIGHT } from '@/ui/tabBarHeight';

/** The screen's toasts: above the phone's tab bar while signed in, at the bottom otherwise. */
export function ScreenToasts() {
  const { phone } = useLayout();
  const signedIn = useSession((s) => s.status === 'signedIn');
  return <ToastHost above={phone && signedIn ? TAB_BAR_HEIGHT : 0} />;
}
