/** Query keys, in one place so realtime events invalidate exactly what they change. */
export const qk = {
  me: ['me'] as const,
  countries: (locale: string, timeZone: string) => ['countries', locale, timeZone] as const,
  currencies: (locale: string) => ['currencies', locale] as const,
  timeZones: (locale: string, device: string) => ['time-zones', locale, device] as const,
  ai: ['ai'] as const,
  plan: ['plan'] as const,
  insights: (days: number) => ['insights', days] as const,
  billing: ['billing'] as const,
  orgBilling: (orgId: string) => ['org-billing', orgId] as const,
  spaces: ['spaces'] as const,
  orgs: ['orgs'] as const,
  org: (handle: string) => ['org', handle] as const,
  orgSpaces: (id: string) => ['org-spaces', id] as const,
  orgDoor: (id: string) => ['org-door', id] as const,
  orgInbox: (orgId: string, view: string) => ['org-inbox', orgId, view] as const,
  orgInsights: (orgId: string, days: number) => ['org-insights', orgId, days] as const,
  businessSummary: ['business-summary'] as const,
  tokens: ['personal-tokens'] as const,
  oauthApps: ['oauth-apps'] as const,
  orgAgent: (orgId: string) => ['org-agent', orgId] as const,
  connectedApps: ['connected-apps'] as const,
  /** My invite links (R1). */
  invites: ['invites'] as const,
  invite: (token: string) => ['invite', token] as const,
  /** Whether there's a calendar feed (PRD §72), never its address. */
  calendarFeed: ['calendar-feed'] as const,
  space: (id: string) => ['space', id] as const,
  inbox: ['inbox'] as const,
  inboxAll: ['inbox', 'all'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  about: ['about'] as const,
  /** The organization's own kinds of card its team may send in this conversation. */
  conversationKits: (id: string) => ['conversation-kits', id] as const,
  messages: (id: string) => ['messages', id] as const,
  album: (messageId: string) => ['album', messageId] as const,
  memory: (id: string) => ['memory', id] as const,
  /** What a conversation keeps pinned at its top (PRD §22). */
  pins: (id: string) => ['pins', id] as const,
  /** What's been shared in a conversation (PRD §26), all of it or one tab of it. */
  assets: (id: string, tab?: string) =>
    tab ? (['assets', id, tab] as const) : (['assets', id] as const),
  suggestions: (conversationId?: string) => ['suggestions', conversationId ?? 'all'] as const,
  /** Two of someone's connections who may be one person (PRD §51). */
  duplicates: ['suggestions', 'kind', 'duplicate'] as const,
  person: (id: string) => ['person', id] as const,
  /** Call history: every call, the missed ones, or those with one person. */
  calls: (filter: string) => ['calls', filter] as const,
  callsPage: (filter: string, limit: number) => ['calls', filter, limit] as const,
  relationshipHistory: (id: string) => ['relationship-history', id] as const,
  connections: ['connections'] as const,
  /** Updates: the organizations someone follows, and each one's updates (PRD §59). */
  following: ['updates', 'following'] as const,
  orgUpdates: (orgId: string) => ['updates', 'org', orgId] as const,
  requests: (direction: 'incoming' | 'outgoing') => ['requests', direction] as const,
  taxonomy: ['taxonomy'] as const,
  tasks: (view: string, scope?: string) => ['tasks', view, scope ?? ''] as const,
  /** The calendar (R51): a person's, and an organization's bookings, by window. */
  calendar: (from: string, to: string) => ['calendar', from, to] as const,
  orgCalendar: (orgId: string, from: string, to: string) =>
    ['org-calendar', orgId, from, to] as const,
  orgSlots: (orgId: string, from: string, to: string) => ['org-slots', orgId, from, to] as const,
  decisions: (conversationId?: string) => ['decisions', conversationId ?? 'all'] as const,
  notifications: ['notifications'] as const,
  policies: ['policies'] as const,
  automations: ['automations'] as const,
  /** What's saved (PRD §69): the collections, and one collection's items (or all of them). */
  saved: ['saved'] as const,
  savedItems: (collection?: string) => ['saved', 'items', collection ?? ''] as const,
  sessions: ['sessions'] as const,
  search: (term: string, understand = false) => ['search', term, understand] as const,
  peopleSearch: (term: string) => ['people-search', term] as const,
  orgSearch: (term: string) => ['org-search', term] as const,
  /** Someone's page by their handle (`/@handle`), before it's known whose it is. */
  handle: (handle: string) => ['handle', handle] as const,
  /** An app asking to act for someone (PRD §74), by its request's parameters. */
  oauthConsent: (params: unknown) => ['oauth-consent', params] as const,
  appDeliveries: (appId: string) => ['app-deliveries', appId] as const,
  /** What's suggested about one person, or about everyone. */
  suggestionsAbout: (personId?: string) =>
    ['suggestions', 'relationship', personId ?? 'all'] as const,
  /** The rule that applies to one person (PRD §33). */
  policyFor: (personId: string) => ['policy-for', personId] as const,
  orgInboxes: (orgId: string) => ['org-inbox', orgId] as const,
  // Prefixes: everything of a kind at once, for a live event that changes any of them.
  allTasks: ['tasks'] as const,
  allMemory: ['memory'] as const,
  allSuggestions: ['suggestions'] as const,
  allDecisions: ['decisions'] as const,
  allMessages: ['messages'] as const,
  allSpaces: ['space'] as const,
  allPeople: ['person'] as const,
  allOrgs: ['org'] as const,
  allOrgInboxes: ['org-inbox'] as const,
  allUpdates: ['updates'] as const,
  allCalendars: ['calendar'] as const,
  allOrgCalendars: ['org-calendar'] as const,
  allPoliciesFor: ['policy-for'] as const,
};
