/** Query keys, in one place so realtime events invalidate exactly what they change. */
export const qk = {
  me: ['me'] as const,
  countries: (locale: string, timeZone: string, region = '') =>
    ['countries', locale, timeZone, region] as const,
  currencies: (locale: string) => ['currencies', locale] as const,
  timeZones: (locale: string, device: string) => ['time-zones', locale, device] as const,
  ai: ['ai'] as const,
  plan: ['plan'] as const,
  insights: (days: number) => ['insights', days] as const,
  billing: ['billing'] as const,
  orgBilling: (orgId: string) => ['org-billing', orgId] as const,
  spaces: ['spaces'] as const,
  orgs: ['orgs'] as const,
  /** Organizations you closed last whose export is still open to you (DPA §12). */
  closedOrgs: ['closed-orgs'] as const,
  org: (handle: string) => ['org', handle] as const,
  orgSpaces: (id: string) => ['org-spaces', id] as const,
  orgDoor: (id: string) => ['org-door', id] as const,
  /** Its open team invites (M16 C3a), and one opened by its link. */
  teamInvites: (orgId: string) => ['team-invites', orgId] as const,
  teamInvite: (token: string) => ['team-invite', token] as const,
  /** A group's or a space's open join links (M16 C3e), and one opened by its link. */
  joinLinks: (target: 'group' | 'space', id: string) => ['join-links', target, id] as const,
  joinRequests: (target: 'group' | 'space', id: string) => ['join-requests', target, id] as const,
  groupLink: (token: string) => ['group-link', token] as const,
  orgCheckout: (id: string) => ['org-checkout', id] as const,
  orgInbox: (orgId: string, view: string, tag?: string | null) =>
    ['org-inbox', orgId, view, tag ?? null] as const,
  orgInsights: (orgId: string, days: number) => ['org-insights', orgId, days] as const,
  businessSummary: ['business-summary'] as const,
  tokens: ['personal-tokens'] as const,
  oauthApps: ['oauth-apps'] as const,
  orgAgent: (orgId: string) => ['org-agent', orgId] as const,
  /** What its AI agent couldn't answer (M16 G6b), for its setup. */
  orgAgentQuestions: (orgId: string) => ['org-agent-questions', orgId] as const,
  /** Its quick replies (M16 H2), for its team's composer and its setup. */
  quickReplies: (orgId: string) => ['quick-replies', orgId] as const,
  /** What its team keeps about one customer (M16 H3), and the tags it uses. */
  customerRecord: (orgId: string, customerId: string) =>
    ['customer-record', orgId, customerId] as const,
  customerTags: (orgId: string) => ['customer-tags', orgId] as const,
  /** Its intake forms (M16 H5), for its setup and the item editor's choice. */
  orgForms: (orgId: string) => ['org-forms', orgId] as const,
  /** An organization's own apps (its tokens and webhooks), and the listings published under it. */
  orgApps: (orgId: string) => ['org-apps', orgId] as const,
  orgListings: (orgId: string) => ['org-listings', orgId] as const,
  /** The orders in its customer conversations (R60), for the Business inbox's Orders view. */
  orgOrders: (orgId: string) => ['org-orders', orgId] as const,
  connectedApps: ['connected-apps'] as const,
  /** A person's places (R92), and those a conversation's card may say. */
  myPlaces: ['places'] as const,
  conversationPlaces: (id: string) => ['places', 'conversation', id] as const,
  /** Someone's own email addresses and phone numbers (R91). */
  addresses: ['addresses'] as const,
  /** Connected Google and Microsoft accounts (R90). */
  accounts: ['accounts'] as const,
  /** A connected OneDrive's folder or search (R90), page by page. */
  accountFiles: (id: string, folder: string | null, search: string) =>
    ['accounts', id, 'files', folder, search] as const,
  /** Discover (R74): a search and a category each page on their own. */
  directory: (search: string, category: string) => ['directory', search, category] as const,
  directoryApp: (id: string) => ['directory', 'app', id] as const,
  /** Every page of Discover and every app's own view: a connection changes them all. */
  allDirectory: ['directory'] as const,
  /** My invite links (R1), and the general one onboarding shares (refreshed with them). */
  invites: ['invites'] as const,
  generalInvite: ['invites', 'general'] as const,
  contactAccounts: ['contact-accounts'] as const,
  invite: (token: string) => ['invite', token] as const,
  /** A link's card in the composer (M16 E4c), by its address. */
  linkPreview: (url: string) => ['link-preview', url] as const,
  /** A paid Pay card's receipt (R62). */
  receipt: (messageId: string) => ['receipt', messageId] as const,
  /** A meeting guest's link (R84): the meeting, and theirs once they've taken it. */
  joinLink: (token: string) => ['join-link', token] as const,
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
  /** The same across a person's or a space's conversations (M16 H6), one tab of it. */
  filesOf: (kind: 'person' | 'space', id: string, tab: string) =>
    ['files-of', kind, id, tab] as const,
  /** Your open links to one of your files (M16 H6). */
  fileLinks: (fileId: string) => ['file-links', fileId] as const,
  suggestions: (conversationId?: string) => ['suggestions', conversationId ?? 'all'] as const,
  /** Two of someone's connections who may be one person (PRD §51). */
  duplicates: ['suggestions', 'kind', 'duplicate'] as const,
  person: (id: string) => ['person', id] as const,
  /** Call history: every call, the missed ones, or those with one person. */
  calls: (filter: string) => ['calls', filter] as const,
  callsPage: (filter: string, limit: number) => ['calls', filter, limit] as const,
  /** What was said in a call while Cai took notes (M16 F7). */
  callNotes: (callId: string) => ['call-notes', callId] as const,
  /** A call's recording shared into a conversation, by the share's message (M17 I13e). */
  recordingShare: (messageId: string) => ['recording-share', messageId] as const,
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
  slots: (
    kind: 'org' | 'person',
    id: string,
    from: string,
    to: string,
    item: string | null,
    quantity: number,
    except: string | null = null,
  ) => ['slots', kind, id, from, to, item, quantity, except] as const,
  myBooking: ['my-booking'] as const,
  brief: (messageId: string) => ['brief', messageId] as const,
  decisions: (conversationId?: string) => ['decisions', conversationId ?? 'all'] as const,
  notifications: ['notifications'] as const,
  policies: ['policies'] as const,
  automations: ['automations'] as const,
  /** What's saved (PRD §69): the collections, and one collection's items (or all of them). */
  saved: ['saved'] as const,
  savedItems: (collection?: string) => ['saved', 'items', collection ?? ''] as const,
  sessions: ['sessions'] as const,
  /** The account's passkeys (R36). */
  passkeys: ['passkeys'] as const,
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
  /** The Attention home's own part (R66): waiting, coming up, the one question. */
  attentionHome: ['attention-home'] as const,
  /** What this person missed (M17 I3): the rules' recap, and the summary under the same prefix. */
  missed: ['attention-missed'] as const,
  missedSummary: ['attention-missed', 'summary'] as const,
  cai: ['cai'] as const,
  /** Every conversation's view, for what changes in all of them at once (its open line). */
  allConversationViews: ['conversation'] as const,
  allMemory: ['memory'] as const,
  allSuggestions: ['suggestions'] as const,
  allDecisions: ['decisions'] as const,
  allMessages: ['messages'] as const,
  allSpaces: ['space'] as const,
  allPeople: ['person'] as const,
  allOrgs: ['org'] as const,
  allOrgListings: ['org-listings'] as const,
  allOrgInboxes: ['org-inbox'] as const,
  allOrgDoors: ['org-door'] as const,
  /** Every organization's open team invites (M16 C3a). */
  allTeamInvites: ['team-invites'] as const,
  /** Every place's open join links (M16 C3e). */
  allJoinLinks: ['join-links'] as const,
  /** Every place's asks to join (M16 C3h). */
  allJoinRequests: ['join-requests'] as const,
  allUpdates: ['updates'] as const,
  allCalendars: ['calendar'] as const,
  allOrgCalendars: ['org-calendar'] as const,
  allOrgOrders: ['org-orders'] as const,
  allSlots: ['slots'] as const,
  allPoliciesFor: ['policy-for'] as const,
  /** Every list of calls (an ended call is in each of them). */
  allCalls: ['calls'] as const,
  /** Requests both ways. */
  allRequests: ['requests'] as const,
  allRelationshipHistory: ['relationship-history'] as const,
};
