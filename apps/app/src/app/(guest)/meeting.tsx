import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

/**
 * Where a guest lands at any address but their link (R84): back to their meeting by the link
 * this device kept, or, without it, how to get there.
 */
export default function GuestHome() {
  const [lost, setLost] = useState(false);
  useEffect(() => {
    void import('@/state/guestLink')
      .then((g) => g.guestLink())
      .then((link) => {
        if (link?.startsWith('/j/')) router.replace(link as never);
        else setLost(true);
      });
  }, []);
  if (!lost) return null;
  return (
    <AuthLayout title={tr('Your meeting')} back={false}>
      <Text color="textSecondary">
        {tr('Open the link from your invitation again to get back to your meeting.')}
      </Text>
      <Button
        label={tr('Sign out')}
        variant="secondary"
        onPress={() => void useSession.getState().signOut()}
      />
    </AuthLayout>
  );
}
