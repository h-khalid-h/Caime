import { tr } from '@caime/core/i18n';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import UserPlus from 'lucide-react-native/icons/user-plus';
import { useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { useLayout } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { toast } from '@/ui/Toast';

/**
 * An invite link opened signed in (R1): the connection forms at once, with the inviter's own
 * label on their side, and this opens the conversation. Already connected, it opens it too; the
 * inviter's own opens their people.
 */
export default function InviteLink() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const { desktop } = useLayout();
  const [problem, setProblem] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => endpoints.acceptInvite(token),
    onSuccess: (res) => {
      if (res.status === 'requested') {
        // Under 18 (R29): their link stands as a request they decide on.
        toast(tr('Sent as a request: they choose who connects with them'));
        router.replace('/connect');
        return;
      }
      if (!res.already) toast(tr('You’re connected'));
      router.replace({ pathname: '/c/[id]', params: { id: res.conversationId } });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 400) {
        // Their own link: nothing to accept.
        router.replace('/connect');
        return;
      }
      setProblem(
        e instanceof ApiError && e.status === 404
          ? tr(
              'This invite has run out, or was taken back. Ask them for a new link, or find them by @handle.',
            )
          : (e as Error).message,
      );
    },
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per link
  useEffect(() => {
    if (token) accept.mutate();
    else setProblem(tr('That isn’t an invite link.'));
  }, [token]);
  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      {problem ? (
        <EmptyState
          title={tr('Nothing to open')}
          body={problem}
          icon={UserPlus}
          action={<Button label={tr('Find people')} onPress={() => router.replace('/connect')} />}
        />
      ) : (
        <SkeletonRows count={3} />
      )}
    </Screen>
  );
}
