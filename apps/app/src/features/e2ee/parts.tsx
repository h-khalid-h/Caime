/**
 * Private conversations' parts of screens (R18): each loads when first shown, never with the
 * app (most people see them only in a private conversation, or when a device of theirs waits).
 */
import { lazyPart } from '@/ui/Lazy';

export const PrivateSheet = lazyPart(() => import('./PrivateSheet').then((m) => m.PrivateSheet));
export const CodeChangedBanner = lazyPart(() =>
  import('./PrivateSheet').then((m) => m.CodeChangedBanner),
);
export const Downgraded = lazyPart(() => import('./PrivateSheet').then((m) => m.Downgraded));
export const WaitingDevices = lazyPart(() =>
  import('./PrivateSheet').then((m) => m.WaitingDevices),
);
export const StartOverSheet = lazyPart(() =>
  import('./PrivateSheet').then((m) => m.StartOverSheet),
);
export const PrivateDevices = lazyPart(() => import('./Devices').then((m) => m.PrivateDevices));
