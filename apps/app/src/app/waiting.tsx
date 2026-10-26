import type { FamilyResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/keys';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

/**
 * A child's account its parent hasn't agreed to yet (R122): whose yes it waits for, what that
 * parent will see, and nothing of the app until then. It goes on by itself when the parent
 * agrees (their `me.updated` refreshes the session), or when asked again.
 */
export default function Waiting() {
  // Asked here as Family asks it (features/family/api.ts): a module both imported would sit in
  // the chunk every screen shares.
  const family = useQuery({
    queryKey: qk.family,
    queryFn: () => api.get<FamilyResponse>('/me/family'),
  });
  const parent = family.data?.guardian?.person.displayName;
  const [checking, setChecking] = useState(false);
  return (
    <AuthLayout
      kicker={tr('Family')}
      title={parent ? tr('Waiting for {name}', { name: parent }) : tr('Waiting for your parent')}
      back={false}
      security
    >
      <Text color="textSecondary" testID="waiting-for-parent">
        {tr(
          'Your parent or guardian agrees to your account from their own Caime. We told them. Once they do, Caime opens here.',
        )}
      </Text>
      <Text color="textSecondary">
        {tr('They’ll see whom you’re connected with and who asks to connect. Never your messages.')}
      </Text>
      <Text color="textTertiary" variant="caption">
        {tr('If they don’t answer within a week, this account is deleted.')}
      </Text>
      <Button
        label={tr('Check again')}
        loading={checking}
        onPress={() => {
          setChecking(true);
          void useSession
            .getState()
            .refresh()
            .finally(() => setChecking(false));
        }}
        testID="waiting-check"
      />
      <Button
        label={tr('Sign out')}
        variant="secondary"
        onPress={() => void useSession.getState().signOut()}
      />
    </AuthLayout>
  );
}
