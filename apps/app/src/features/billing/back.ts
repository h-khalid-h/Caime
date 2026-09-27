import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

/**
 * Back from Checkout: the plan changes once Stripe tells the server it's paid (its webhook), so
 * what's shown is asked for again, every two seconds for half a minute, until it has.
 */
export function useBackFromCheckout(keys: readonly (readonly unknown[])[]): 'done' | null {
  const qc = useQueryClient();
  const { billing } = useLocalSearchParams<{ billing?: string }>();
  const back = billing === 'done' ? 'done' : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on coming back
  useEffect(() => {
    if (back !== 'done') return;
    let n = 0;
    const timer = setInterval(() => {
      for (const key of keys) void qc.invalidateQueries({ queryKey: key });
      if (++n >= 15) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [back]);
  return back;
}
