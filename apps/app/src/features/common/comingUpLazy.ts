import { lazyPart } from '@/ui/Lazy';

/** Loaded as it's first shown: two screens show it, and shared it would load with the app. */
export const ComingUpList = lazyPart(() => import('./ComingUp').then((m) => m.ComingUpList));
