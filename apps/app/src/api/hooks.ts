/** Query hooks shared by screens, the shell's badges and the desktop panes. */
import type { AssetView } from '@caime/core/api';
import type { BusinessView } from '@caime/core/business';
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

export const useConversation = (id: string, options: { refetchOnMount?: 'always' } = {}) =>
  useQuery({
    queryKey: qk.conversation(id),
    queryFn: () => endpoints.conversation(id),
    enabled: Boolean(id),
    ...options,
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

export const useRelationshipHistory = (id: string) =>
  useQuery({
    queryKey: qk.relationshipHistory(id),
    queryFn: () => endpoints.relationshipHistory(id),
    enabled: Boolean(id),
  });

export const useTaxonomy = () =>
  useQuery({ queryKey: qk.taxonomy, queryFn: endpoints.taxonomy, staleTime: 10 * 60_000 });

export const useSuggestions = (conversationId?: string) =>
  useQuery({
    queryKey: qk.suggestions(conversationId),
    queryFn: () => endpoints.suggestions(conversationId ? { conversationId } : {}),
  });

/** Possible duplicates among someone's connections, offered in People (PRD §51). */
export const useDuplicates = () =>
  useQuery({
    queryKey: qk.duplicates,
    queryFn: () => endpoints.suggestions({ kind: 'duplicate' }),
  });

export const usePins = (conversationId: string, enabled = true) =>
  useQuery({
    queryKey: qk.pins(conversationId),
    queryFn: () => endpoints.pins(conversationId),
    enabled: enabled && Boolean(conversationId),
  });

export const useMemory = (conversationId: string, enabled = true) =>
  useQuery({
    queryKey: qk.memory(conversationId),
    queryFn: () => endpoints.memory(conversationId),
    enabled: enabled && Boolean(conversationId),
  });

export const usePolicies = () => useQuery({ queryKey: qk.policies, queryFn: endpoints.policies });

/** How Caime thinks someone may be known (PRD §12), for one person or everyone. */
export const useRelationshipOffers = (personId?: string) =>
  useQuery({
    queryKey: ['suggestions', 'relationship', personId ?? 'all'],
    queryFn: () =>
      endpoints.suggestions({
        kind: 'relationship',
        ...(personId ? { subjectUserId: personId } : {}),
      }),
  });

export const useAutomations = () =>
  useQuery({ queryKey: qk.automations, queryFn: endpoints.automations });

export const useSaved = () => useQuery({ queryKey: qk.saved, queryFn: endpoints.saved });

export const useSavedItems = (collection?: string) =>
  useInfiniteQuery({
    queryKey: qk.savedItems(collection),
    queryFn: ({ pageParam }) => endpoints.savedItems(collection, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });

/** Whether this server offers AI assist, and whether this person turned it on. */
export const useAiStatus = () =>
  useQuery({ queryKey: qk.ai, queryFn: endpoints.ai, staleTime: 10 * 60_000 });

export const useSpaces = () => useQuery({ queryKey: qk.spaces, queryFn: endpoints.spaces });

export const useSpace = (id: string) =>
  useQuery({ queryKey: qk.space(id), queryFn: () => endpoints.space(id), enabled: Boolean(id) });

export const useOrgs = () => useQuery({ queryKey: qk.orgs, queryFn: endpoints.orgs });
/** The organization's spaces you're in (R43); only asked for on its team. */
export const useOrgSpaces = (orgId: string | null) =>
  useQuery({
    queryKey: qk.orgSpaces(orgId ?? ''),
    queryFn: () => endpoints.orgSpaces(orgId ?? ''),
    enabled: Boolean(orgId),
  });
export const useMyPlan = () => useQuery({ queryKey: qk.plan, queryFn: endpoints.myPlan });
export const useMyInsights = (days: 30 | 90 | 365) =>
  useQuery({
    queryKey: qk.insights(days),
    queryFn: () => endpoints.myInsights(days),
    // Told once that it's Pro's: no use asking again until the plan changes.
    retry: false,
  });
export const useBilling = () => useQuery({ queryKey: qk.billing, queryFn: endpoints.billing });
export const useOrgBilling = (orgId: string | null) =>
  useQuery({
    queryKey: qk.orgBilling(orgId ?? ''),
    queryFn: () => endpoints.orgBilling(orgId ?? ''),
    enabled: Boolean(orgId),
  });

export const useOrgInbox = (orgId: string | undefined, view: BusinessView) =>
  useQuery({
    queryKey: qk.orgInbox(orgId ?? '', view),
    queryFn: () => endpoints.orgInbox(orgId ?? '', view),
    enabled: Boolean(orgId),
  });

/** Your organizations' inboxes, only when you're on a team (R7: only what needs you). */
export const useBusinessSummary = (enabled = true) =>
  useQuery({ queryKey: qk.businessSummary, queryFn: endpoints.businessSummary, enabled });

export const useOrg = (handle: string) =>
  useQuery({
    queryKey: qk.org(handle),
    queryFn: () => endpoints.orgByHandle(handle),
    enabled: Boolean(handle),
  });

/** Updates: the organizations this person follows, the latest first (PRD §59). */
export const useFollowing = (enabled = true) =>
  useQuery({ queryKey: qk.following, queryFn: endpoints.following, enabled });

/** An organization's updates on its page, newest first, a page at a time. */
export const useOrgUpdates = (orgId: string) =>
  useInfiniteQuery({
    queryKey: qk.orgUpdates(orgId),
    queryFn: ({ pageParam }) => endpoints.orgUpdates(orgId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: Boolean(orgId),
  });

/** What's been shared in a conversation, of some kinds, newest first (PRD §26). */
export const useAssets = (
  conversationId: string,
  tab: string,
  kinds: readonly AssetView['kind'][],
) =>
  useInfiniteQuery({
    queryKey: qk.assets(conversationId, tab),
    queryFn: ({ pageParam }) => endpoints.assets(conversationId, kinds, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    // Another tab keeps the counts it had (they're of everything) while its own list loads.
    placeholderData: keepPreviousData,
  });

/** Call history (PRD §47): `missed`, or `with:<id>` for the calls with one person. */
export const useCallHistory = (filter: 'all' | 'missed' | `with:${string}`, limit = 30) =>
  useInfiniteQuery({
    queryKey: [...qk.calls(filter), limit],
    queryFn: ({ pageParam }) =>
      endpoints.callHistory({
        before: pageParam,
        limit,
        missed: filter === 'missed' || undefined,
        with: filter.startsWith('with:') ? filter.slice(5) : undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
