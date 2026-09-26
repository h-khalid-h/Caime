/** Query hooks shared by screens, the shell's badges and the desktop panes. */
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { endpoints, type TaskViewFilter } from './endpoints';
import { qk } from './keys';

export const useInbox = () => useQuery({ queryKey: qk.inbox, queryFn: endpoints.inbox });
export const useInboxAll = () => useQuery({ queryKey: qk.inboxAll, queryFn: endpoints.inboxAll });

export const useRequests = (direction: 'incoming' | 'outgoing' = 'incoming') =>
  useQuery({ queryKey: qk.requests(direction), queryFn: () => endpoints.requests(direction) });

export const useConnections = () =>
  useQuery({ queryKey: qk.connections, queryFn: () => endpoints.connections() });

export const useTasks = (
  view: TaskViewFilter,
  scope: { conversationId?: string; personId?: string } = {},
) =>
  useQuery({
    queryKey: qk.tasks(view, scope.conversationId ?? scope.personId),
    queryFn: () => endpoints.tasks(view, scope),
    placeholderData: keepPreviousData,
  });

export const useNotifications = () =>
  useQuery({ queryKey: qk.notifications, queryFn: endpoints.notifications });

export const useConversation = (id: string) =>
  useQuery({
    queryKey: qk.conversation(id),
    queryFn: () => endpoints.conversation(id),
    enabled: Boolean(id),
  });

export const PAGE = 50;

export const useMessages = (id: string) =>
  useInfiniteQuery({
    queryKey: qk.messages(id),
    queryFn: ({ pageParam }) =>
      endpoints.messages(id, pageParam ? { before: pageParam, limit: PAGE } : { limit: PAGE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.seq : undefined),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

export const usePerson = (id: string) =>
  useQuery({ queryKey: qk.person(id), queryFn: () => endpoints.person(id), enabled: Boolean(id) });

export const useTaxonomy = () =>
  useQuery({ queryKey: qk.taxonomy, queryFn: endpoints.taxonomy, staleTime: 10 * 60_000 });

export const useSuggestions = (conversationId?: string) =>
  useQuery({
    queryKey: qk.suggestions(conversationId),
    queryFn: () => endpoints.suggestions(conversationId ? { conversationId } : {}),
  });

export const useMemory = (conversationId: string, enabled = true) =>
  useQuery({
    queryKey: qk.memory(conversationId),
    queryFn: () => endpoints.memory(conversationId),
    enabled: enabled && Boolean(conversationId),
  });

export const usePolicies = () => useQuery({ queryKey: qk.policies, queryFn: endpoints.policies });
