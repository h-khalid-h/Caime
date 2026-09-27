import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSession } from '@/state/session';

/**
 * Back from Checkout: the plan changes once Stripe tells the server it's paid (its webhook), so
 * what's shown (and who they are, for the plan in Settings) is asked for again, every two seconds
 * for half a minute. It says so only while it's asking: after that, or reached by a link with
 * nothing paid, the page is as it always is.
 */
export function useBackFromCheckout(keys: readonly (readonly unknown[])[]): 'done' | null {
  const qc = useQueryClient();
  const { billing } = useLocalSearchParams<{ billing?: string }>();
  const [asking, setAsking] = useState(billing === 'done');
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on coming back
  useEffect(() => {
    if (billing !== 'done') return;
    setAsking(true);
    let n = 0;
    const timer = setInterval(() => {
      for (const key of keys) void qc.invalidateQueries({ queryKey: key });
      void useSession.getState().refresh();
      if (++n >= 15) {
        clearInterval(timer);
        setAsking(false);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [billing]);
  return asking ? 'done' : null;
}
