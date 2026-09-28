/**
 * Where the call screens go (the app's layout): nothing, until there's a call to show, and then
 * the screens, loaded with the calls themselves (load.web.ts). What's ringing is asked for by the
 * realtime socket each time it connects (realtime/client.ts).
 */
import { lazy, Suspense } from 'react';
import { useCall } from '@/state/calls';
import { useGroupCall } from '@/state/groupCall';
import { loadCallStack } from './load.web';

const CallScreens = lazy(() => loadCallStack().then((s) => ({ default: s.CallScreens })));

export function CallLayer() {
  const oneToOne = useCall((s) => Boolean(s.call && s.phase));
  const group = useGroupCall((s) => Boolean(s.call && s.phase));
  if (!oneToOne && !group) return null;
  return (
    <Suspense fallback={null}>
      <CallScreens />
    </Suspense>
  );
}
