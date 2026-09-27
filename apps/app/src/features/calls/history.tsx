/**
 * Call history (PRD §47) loads when it's shown: the Calls screen and the calls on someone's page
 * both come through here, so neither puts it in the app's first download.
 */
import { lazy, Suspense } from 'react';
import type { CallRows as Rows, CallHistory as Screen } from './CallHistory';

const LazyScreen = lazy(() => import('./CallHistory').then((m) => ({ default: m.CallHistory })));
const LazyRows = lazy(() => import('./CallHistory').then((m) => ({ default: m.CallRows })));

export function CallHistory(props: Parameters<typeof Screen>[0]) {
  return (
    <Suspense fallback={null}>
      <LazyScreen {...props} />
    </Suspense>
  );
}

export function CallRows(props: Parameters<typeof Rows>[0]) {
  return (
    <Suspense fallback={null}>
      <LazyRows {...props} />
    </Suspense>
  );
}
