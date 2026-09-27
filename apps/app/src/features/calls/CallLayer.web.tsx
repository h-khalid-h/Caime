/**
 * Where the call screens go (the app's layout): nothing, until there's a call to show, and then
 * the screens, loaded with the calls themselves (calls.web.ts).
 */
import { lazy, Suspense, useEffect } from 'react';
import { useCall } from '@/state/calls';
import { useGroupCall } from '@/state/groupCall';
import { useSession } from '@/state/session';
import { checkLiveCall, checkLiveGroupCall, loadCallStack } from './calls.web';

const CallScreens = lazy(() => loadCallStack().then((s) => ({ default: s.CallScreens })));

export function CallLayer() {
  const me = useSession((s) => s.user?.id ?? '');
  // A call this device is in (the page reloaded mid-call), or one ringing for it: asked as it opens.
  useEffect(() => {
    if (!me) return;
    void checkLiveCall(me).catch(() => {});
    void checkLiveGroupCall(me).catch(() => {});
  }, [me]);
  const oneToOne = useCall((s) => Boolean(s.call && s.phase));
  const group = useGroupCall((s) => Boolean(s.call && s.phase));
  if (!oneToOne && !group) return null;
  return (
    <Suspense fallback={null}>
      <CallScreens />
    </Suspense>
  );
}
