/**
 * Who asked to join a group or a space through a link that asks (M16 C3h), for its owner and
 * admins: each let in, or not, with a tap. Nothing shows while nobody waits. Loaded where it's
 * shown: a group's people, a space's people and the link panel in their Add sheets.
 */

import { tr } from '@caime/core/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { toast } from '@/ui/Toast';

export function JoinRequests({ target, id }: { target: 'group' | 'space'; id: string }) {
  const qc = useQueryClient();
  const asks = useQuery({
    queryKey: qk.joinRequests(target, id),
    queryFn: () => endpoints.joinRequests(target, id),
  });
  const answer = useMutation({
    mutationFn: (v: { requestId: string; answer: 'accept' | 'decline'; name: string }) =>
      endpoints.answerJoinRequest(target, id, v.requestId, v.answer),
    onSuccess: (_res, v) => {
      void qc.invalidateQueries({ queryKey: qk.joinRequests(target, id) });
      void qc.invalidateQueries({ queryKey: qk.joinLinks(target, id) });
      if (v.answer === 'accept') {
        // Whoever was let in is one of its people now.
        if (target === 'group') void qc.invalidateQueries({ queryKey: qk.conversation(id) });
        else void qc.invalidateQueries({ queryKey: qk.space(id) });
        toast(tr('{name} is in', { name: v.name }), { tone: 'success' });
      } else toast(tr('{name} wasn’t let in', { name: v.name }));
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const waiting = asks.data?.requests ?? [];
  if (!waiting.length) return null;
  return (
    <View testID="join-requests">
      <SectionTitle count={waiting.length}>{tr('Asking to join')}</SectionTitle>
      {waiting.map((r) => (
        <ListRow
          key={r.id}
          left={
            <Avatar
              id={r.person.id}
              name={r.person.displayName}
              url={r.person.avatarUrl}
              size={32}
            />
          }
          title={r.person.displayName}
          subtitle={`@${r.person.handle}`}
          right={
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label={tr('Let in')}
                size="sm"
                loading={answer.isPending && answer.variables?.requestId === r.id}
                onPress={() =>
                  answer.mutate({
                    requestId: r.id,
                    answer: 'accept',
                    name: r.person.displayName,
                  })
                }
                testID={`join-request-accept-${r.id}`}
              />
              <Button
                label={tr('Not now')}
                size="sm"
                variant="secondary"
                disabled={answer.isPending}
                onPress={() =>
                  answer.mutate({
                    requestId: r.id,
                    answer: 'decline',
                    name: r.person.displayName,
                  })
                }
                testID={`join-request-decline-${r.id}`}
              />
            </View>
          }
          testID={`join-request-${r.id}`}
        />
      ))}
    </View>
  );
}
