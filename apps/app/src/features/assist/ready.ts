import type { ConversationView } from '@caime/core/api';
import { useAiStatus } from '@/api/hooks';
import { useMe } from '@/state/session';

/**
 * AI assist can be offered here: the server has a provider, the person is an adult and turned
 * it on, and the conversation isn't private (R17, R18). Otherwise the heuristics are all there is.
 */
export function useAiReady(conversation?: Pick<ConversationView, 'privacyClass'> | null): boolean {
  const me = useMe();
  const status = useAiStatus();
  return (
    Boolean(status.data?.available) &&
    me.aiEnabled &&
    !me.minor &&
    Boolean(conversation) &&
    conversation?.privacyClass !== 'private'
  );
}
