/**
 * The API contract (docs/ARCHITECTURE.md "API conventions"): every response shape the server
 * returns and the clients read. The server's view builders are annotated with these types, so a
 * field that drifts on either side is a compile error in both packages. Request bodies are the
 * zod schemas in ./schemas; everything here is a response. Types only: nothing here ships code.
 */
import type { z } from 'zod';
import type { AgentAction } from './agents';
import type { ApiScope, WebhookEvent } from './apps';
import type { AttentionReason, AttentionSection } from './attention';
import type { BusinessView, ThreadState } from './business';
import type { CallKind, CallOutcome, CallResult, CallState, GroupCallMemberState } from './calls';
import type { PublicJwk, SealedMessage } from './e2ee';
import type { OrgKind, OrgRole } from './orgs';
import type { OrgAllowance, OrgPlan, PersonAllowance } from './plans';
import type { NotificationLevel, RelationshipPolicy } from './policy';
import type { PrivacySettings } from './privacy';
import type { Preferences } from './schemas';
import type { ParsedQuery } from './search';
import type { SpaceKind, SpaceRole } from './spaces';
import type { Fit, Sphere, SphereGroup } from './taxonomy';
import type { Trust } from './trust';

// --- People ---------------------------------------------------------------------------------

export type UserKind = 'human' | 'bot' | 'agent';
export type Plan = 'personal' | 'pro' | 'business' | 'enterprise';
/** What the account owner chose. */
export type PresenceSetting = 'auto' | 'available' | 'busy' | 'away' | 'invisible';
/** What other people see, after privacy. */
export type PresenceState = 'online' | 'busy' | 'away' | 'offline';
export type UserPreferences = z.infer<typeof Preferences>;
export type BubbleTheme = NonNullable<UserPreferences['bubbleTheme']>;

export interface QuietHours {
  days: number[];
  start: string;
  end: string;
}

export interface MeView {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  displayName: string;
  kind: UserKind;
  birthYear: number | null;
  minor: boolean;
  locale: string;
  timeZone: string;
  region: string | null;
  workweek: number[];
  quietHours: QuietHours | null;
  plan: Plan;
  avatarUrl: string | null;
  bio: string | null;
  pronouns: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  presence: PresenceSetting;
  privacy: PrivacySettings;
  preferences: UserPreferences;
  aiEnabled: boolean;
  onboarded: boolean;
  createdAt: string;
}

export interface PersonView {
  id: string;
  handle: string;
  displayName: string;
  kind: UserKind;
  avatarUrl: string | null;
  bio: string | null;
  pronouns: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  presence: PresenceState | null;
  lastSeenAt: string | null;
  identity: { headline: string | null; orgName: string | null } | null;
  trust: Trust;
}

export type RelationshipStatus = 'active' | 'ended' | 'archived' | 'superseded' | 'merged';

/** How I classify someone. Directional and private to me unless `shared` (PRD §9, §34). */
export interface RelationshipView {
  id: string;
  sphere: Sphere;
  role: string | null;
  roleLabel: string | null;
  orgName: string | null;
  contextNote: string | null;
  label: string;
  status: RelationshipStatus;
  isPrimary: boolean;
  shared: boolean;
  source: string;
  startedAt: string;
  endedAt: string | null;
}

export interface ConnectionStateView {
  state: 'connected' | 'outgoing' | 'incoming' | 'none';
  connectionId: string | null;
  requestId: string | null;
}

/** Only when both people chose to share their classification (PRD §53). */
export interface MutualFit {
  fit: Fit;
  theirLabel: string;
}

export type AttentionOverride = 'auto' | 'priority' | 'normal' | 'quiet';

export interface ConnectionView {
  connectionId: string;
  person: PersonView;
  nickname: string | null;
  attention: AttentionOverride;
  mutedUntil: string | null;
  archived: boolean;
  connectedAt: string;
  lastInteractionAt: string | null;
  relationships: RelationshipView[];
  conversationId: string | null;
  /**
   * Other accounts you said are this same person (PRD §51, a duplicate merged): shown with this
   * one in People, and separated again whenever you like.
   */
  also: Array<{ connectionId: string; person: PersonView; conversationId: string | null }>;
  /** You said this account is the same person as another connection of yours (by user id). */
  mergedInto: string | null;
}

export interface ConnectionRequestView {
  id: string;
  direction: 'incoming' | 'outgoing';
  person: PersonView;
  note: string | null;
  /** Context the requester chose to share. Their private classification never is. */
  context: { sphere: Sphere; label: string; orgName: string | null } | null;
  createdAt: string;
}

export interface PeopleSearchResult {
  person: PersonView;
  connection: ConnectionStateView;
  relationship: RelationshipView | null;
}

export interface PersonProfileView {
  person: PersonView;
  connection: ConnectionStateView;
  blockedByMe: boolean;
  relationships: RelationshipView[];
  mutual: MutualFit | null;
  conversations: Array<{
    id: string;
    title: string;
    isGeneral: boolean;
    lastMessageAt: string | null;
  }>;
  summary: {
    messages: number;
    files: number;
    links: number;
    decisions: number;
    openActions: number;
    waiting: number;
  };
}

export interface RelationshipHistoryView {
  current: RelationshipView[];
  history: RelationshipView[];
  events: Array<{
    id: string;
    relationshipId: string;
    kind: string;
    before: unknown;
    after: unknown;
    at: string;
  }>;
  mutual: MutualFit | null;
}

export interface SphereInfo {
  id: Sphere;
  label: string;
  plural: string;
  group: SphereGroup;
  primary: boolean;
  roleQuestion: string;
  asksOrganization: boolean;
  quickRoles: Array<{ id: string; label: string }>;
  moreRoles: Array<{ id: string; label: string; gendered: boolean }>;
  customRoles: Array<{ id: string; label: string }>;
}

export interface TaxonomyResponse {
  primary: SphereInfo[];
  more: SphereInfo[];
}

// --- Messaging ------------------------------------------------------------------------------

export type ConversationKind = 'direct' | 'group' | 'business' | 'community' | 'broadcast';
export type MessageKind =
  | 'text'
  | 'media'
  | 'file'
  | 'voice'
  | 'location'
  | 'contact'
  | 'poll'
  | 'kit'
  | 'sticker'
  | 'system';

export interface FileView {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string;
  thumbUrl: string | null;
}

export interface ReactionView {
  emoji: string;
  count: number;
  mine: boolean;
  userIds: string[];
}

/** An album's photos, as a card shows them: how many, and the latest few. */
export interface AlbumView {
  count: number;
  photos: FileView[];
}

/** One photo in an album, with who added it (to know who may take it out). */
export interface AlbumPhotoView {
  file: FileView;
  addedBy: string | null;
  addedAt: string;
}

export interface MessageView {
  id: string;
  conversationId: string;
  seq: number;
  /** Only for the sender's own messages: the id their device chose, for reconciling echoes. */
  clientId: string | null;
  senderId: string | null;
  /** Sent by a bot or an agent, never a person, and says so wherever it's shown (R16). */
  automated: boolean;
  /** Written by an organization's AI agent (PRD §75): shown as "AI agent", never as a person. */
  aiAgent: boolean;
  kind: MessageKind;
  body: string | null;
  payload: Record<string, unknown>;
  mode: string;
  entities: Record<string, unknown>;
  mentions: string[];
  replyTo: {
    id: string;
    seq: number;
    senderId: string | null;
    preview: string;
    kind: string;
  } | null;
  forwarded: boolean;
  urgent: boolean;
  isQuestion: boolean;
  isRequest: boolean;
  reactions: ReactionView[];
  files: FileView[];
  poll: { counts: Record<string, number>; mine: string[]; voters: number } | null;
  /** A shared album card: how many photos, and the latest few (PRD §41). */
  album: AlbumView | null;
  /** Sent through a token or an app its sender let act for them, not typed in Caishy: its name. */
  sentVia: string | null;
  /**
   * In a private conversation (R18): the message as its sender's device sealed it, for this
   * device to open; `body` is null. The sender's id for it is `sealed.cid`.
   */
  sealed: SealedMessage | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface ParticipantView {
  userId: string;
  role: string;
  person: PersonView;
  /** My classification of them. */
  relationship: RelationshipView | null;
  /** Null when read receipts aren't visible between us (reciprocal, R25). */
  readSeq: number | null;
  deliveredSeq: number;
}

export interface ContextRef {
  id: string;
  kind: string;
  title: string;
  purpose: string | null;
  status: string;
  deadlineAt: string | null;
}

export type RequestDirection = 'incoming' | 'outgoing';

/** The space a conversation belongs to. */
export interface SpaceRef {
  id: string;
  name: string;
  kind: SpaceKind;
}

export interface ConversationView {
  id: string;
  kind: ConversationKind;
  title: string;
  space: SpaceRef | null;
  topic: string | null;
  purpose: string | null;
  isGeneral: boolean;
  parentId: string | null;
  privacyClass: 'standard' | 'private';
  retentionDays: number | null;
  context: ContextRef | null;
  participants: ParticipantView[];
  other: ParticipantView | null;
  /** A conversation with an organization (R15): who it is; for its team, the thread. */
  business: ConversationBusinessView | null;
  me: {
    role: string;
    lastReadSeq: number;
    attention: AttentionOverride;
    mutedUntil: string | null;
    archived: boolean;
    pinned: boolean;
    draft: string | null;
    requestState: 'pending' | 'accepted' | 'declined' | null;
  };
  request: RequestDirection | null;
  /**
   * Someone in it is under 18 (R29): cards that involve money or where someone is aren't offered,
   * and in a business conversation its team knows the customer is.
   */
  hasMinor: boolean;
  lastSeq: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface MessagesPage {
  messages: MessageView[];
  lastSeq: number;
  hasMore: boolean;
}

export interface InboxItemView {
  id: string;
  kind: ConversationKind;
  title: string;
  space: SpaceRef | null;
  topic: string | null;
  isGeneral: boolean;
  parentId: string | null;
  other: PersonView | null;
  /** The organization, in a customer's conversation with one (R15). */
  org: OrgRef | null;
  relationship: { label: string; sphere: Sphere } | null;
  memberCount: number;
  lastMessage: {
    id: string;
    seq: number;
    senderId: string | null;
    kind: MessageKind;
    preview: string;
    mine: boolean;
    createdAt: string;
  } | null;
  unreadCount: number;
  unreadMentions: number;
  lastActivityAt: string;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  attention: AttentionOverride;
  draft: string | null;
  request: RequestDirection | null;
  lastSeq: number;
  section: AttentionSection;
  reasons: AttentionReason[];
  rank: number;
}

export interface InboxSectionView {
  section: AttentionSection;
  label: string;
  items: InboxItemView[];
}

export type SectionCounts = Partial<Record<AttentionSection, number>>;

export interface InboxResponse {
  sections: InboxSectionView[];
  counts: SectionCounts;
  headline: string;
}

export interface InboxAllResponse {
  conversations: InboxItemView[];
  counts: SectionCounts;
  headline: string;
}

// --- Actions, memory, suggestions -----------------------------------------------------------

export type TaskStatus = 'open' | 'accepted' | 'declined' | 'done' | 'cancelled';
/** mine: mine to do · waiting: I'm waiting on them (private) · asked_me · i_asked (they see it). */
export type TaskDirection = 'mine' | 'waiting' | 'asked_me' | 'i_asked';

export interface TaskView {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  direction: TaskDirection;
  shared: boolean;
  owner: { id: string; displayName: string };
  /** `id` is null when the person it waited on deleted their account. */
  assignee: { id: string | null; displayName: string };
  dueAt: string | null;
  dueHasTime: boolean;
  remindAt: string | null;
  conversationId: string | null;
  messageId: string | null;
  source: { preview: string; senderId: string | null; createdAt: string } | null;
  contextId: string | null;
  relationship: string | null;
  origin: string;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskCounts {
  todo: number;
  waiting: number;
  asked_me: number;
  overdue: number;
}

export interface TasksResponse {
  tasks: TaskView[];
  counts: TaskCounts;
}

export interface DecisionView {
  id: string;
  conversationId: string;
  messageId: string | null;
  contextId: string | null;
  title: string;
  notes: string | null;
  decidedBy: { id: string; displayName: string | null } | null;
  decidedAt: string;
}

export interface SuggestionView {
  id: string;
  /** relationship · topic · task · reminder · waiting · decision · duplicate (R12: never a fact). */
  kind: string;
  title: string;
  rationale: string;
  confidence: number;
  payload: Record<string, unknown>;
  conversationId: string | null;
  messageId: string | null;
  subjectUserId: string | null;
  dueAt: string | null;
  dueText: string | null;
  createdAt: string;
}

/** An organization where a conversation shows it (R15): who it is, and whether that's proven. */
export interface OrgRef {
  id: string;
  name: string;
  handle: string;
  kind: OrgKind;
  verified: boolean;
  verifiedDomain: string | null;
}

/**
 * An organization's update (PRD §59): posted by its team to whoever follows it, and read as the
 * organization's, never a person's. Only the team sees who on it posted.
 */
export interface OrgUpdateView {
  id: string;
  org: OrgRef;
  body: string;
  createdAt: string;
  editedAt: string | null;
  /** Who on the team posted it: for the team only (null for everyone else, or an app). */
  postedBy: { id: string; displayName: string } | null;
}

/** An organization's updates as someone sees them on its page. */
export interface OrgUpdatesView {
  updates: OrgUpdateView[];
  /** Older ones, from here (null when there are none). */
  nextBefore: string | null;
  /** Whether they follow it, and are told of each update. */
  following: { notify: boolean } | null;
  /** How many follow it: for its team only. */
  followers: number | null;
  /** They can post: its owner or an admin. */
  canPost: boolean;
  /** Following it isn't possible while they've blocked it. */
  blockedByMe: boolean;
}

/** An organization someone follows, in their Updates. */
export interface FollowingView {
  org: OrgRef;
  latest: OrgUpdateView | null;
  /** Posted since they last looked. */
  unread: number;
  notify: boolean;
}

/** A customer's conversation with an organization, as its team works it (PRD §38). */
export interface BusinessThreadView {
  conversationId: string;
  state: ThreadState;
  customer: PersonView | null;
  assignee: { userId: string; displayName: string } | null;
  escalated: { at: string; byName: string | null; note: string | null } | null;
  resolvedAt: string | null;
  /** Since when the customer has been waiting for an answer. */
  waitingSince: string | null;
  lastMessage: {
    preview: string;
    senderName: string | null;
    fromCustomer: boolean;
    /** The organization's AI agent wrote it. */
    fromAgent: boolean;
    createdAt: string;
  } | null;
  /** Its AI agent handed it to the team (PRD §75), and stays out until it's resolved. */
  agentHandedOverAt: string | null;
  unreadCount: number;
  lastActivityAt: string;
  /** Its customer blocked the organization: closed until they unblock it. */
  closed: boolean;
  /**
   * The team wrote first and the customer hasn't answered or accepted: to them it's a message
   * request (R14), and the team can write again once they do.
   */
  awaitingAcceptance: boolean;
  /** The customer is under 18 (R29): no money cards, and the team answers knowing it. */
  customerUnder18: boolean;
}

/** What the team gets back from writing to someone first (R14). */
export interface StartThreadResult {
  conversationId: string;
  /** A new conversation, not the one the customer already had with the organization. */
  created: boolean;
  message: MessageView;
}

export interface ConversationBusinessView {
  org: OrgRef;
  /** For the customer: how far the organization has read and received their messages. */
  readSeq: number | null;
  deliveredSeq: number;
  /** For the team only: the thread's state, who has it, and why it's escalated. */
  thread: BusinessThreadView | null;
  /** The customer blocked the organization: nobody writes in it until they unblock it. */
  closed: boolean;
}

export interface BusinessInboxView {
  org: OrgRef;
  view: BusinessView;
  threads: BusinessThreadView[];
  counts: Record<BusinessView, number>;
}

/** Each of your organizations' inboxes, with what needs its team (R7: only what needs you). */
export interface BusinessSummaryView {
  orgs: Array<{ org: OrgRef; waiting: number; unassigned: number; mine: number }>;
}

/** An organization's app (PRD §73–75): its token, its bot, its webhook. Managers only. */
export interface OrgAppView {
  id: string;
  name: string;
  /** The bot it answers customers as, if it does (R16: always labelled automated). */
  bot: { userId: string; displayName: string; handle: string } | null;
  scopes: ApiScope[];
  webhookUrl: string | null;
  events: WebhookEvent[];
  /** The start of its token, to tell tokens apart; the whole token is shown once. */
  tokenPrefix: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

/** What's shown once, when an app is made or its token or secret is replaced. */
export interface OrgAppSecretsView {
  app: OrgAppView;
  token: string | null;
  webhookSecret: string | null;
}

export interface WebhookDeliveryView {
  id: string;
  event: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

/** What an @handle link opens: handles are one namespace, a person's or an organization's. */
export interface HandleView {
  kind: 'person' | 'org';
  id: string;
  handle: string;
}

/** An organization as anyone sees it (PRD §36, R15). */
export interface OrgSummaryView {
  id: string;
  name: string;
  handle: string;
  kind: OrgKind;
  about: string | null;
  website: string | null;
  /** It proved it controls `verifiedDomain` with a DNS record. */
  verified: boolean;
  verifiedDomain: string | null;
  memberCount: number;
  /** Your role, when you're on its team. */
  myRole: OrgRole | null;
}

export interface OrgMemberView {
  userId: string;
  role: OrgRole;
  title: string | null;
  person: PersonView;
  joinedAt: string;
}

export interface OrgDomainView {
  name: string;
  verified: boolean;
  verifiedAt: string | null;
  /** The TXT record that proves it. */
  record: { name: string; type: 'TXT'; value: string };
}

export interface OrgView extends OrgSummaryView {
  createdAt: string;
  /** Its team, for the people on it. */
  members: OrgMemberView[] | null;
  /** Verification, for its owner and admins. */
  domain: OrgDomainView | null;
  /** Its plan and what it uses of it, for its owner and admins. */
  plan: OrgPlanView | null;
  /** You blocked it: it can't write to you, and your conversation with it is closed. */
  blockedByMe: boolean;
  /** Its AI agent answers first (PRD §75): everyone sees that before they write. */
  agent: { name: string } | null;
}

/** An organization's AI agent, for its owner and admins (PRD §74–75). */
export interface OrgAgentView {
  name: string;
  /** What the organization told it: the only thing it answers from. */
  knowledge: string;
  /** Paused, it stays on the team and quiet; nothing it wrote goes away. */
  paused: boolean;
  /** What it wrote to customers in the last 24 hours, against what the plan includes. */
  repliesToday: number;
  repliesPerDay: number;
  createdAt: string;
  updatedAt: string;
}

/** What an AI agent would do with a question, tried before it answers anyone. */
export interface AgentTryView {
  action: AgentAction;
  message: string;
}

/** An organization's plan (PRD §84): what it includes and how much of it is in use. */
export interface OrgPlanView {
  plan: OrgPlan;
  allowance: OrgAllowance;
  used: { teamSize: number; apps: number; startsToday: number; agentRepliesToday: number };
  /** Where to see plans and upgrade, when the operator has set one up. */
  upgradeUrl: string | null;
}

/** How fast the team answers, over customers' waits that started in a period (PRD §71). */
export interface ReplyTimesView {
  /** Median time to the team's first answer, in minutes; null with nothing answered yet. */
  medianMinutes: number | null;
  answered: number;
  withinHour: number;
  /** Waits that started in the period and nobody on the team has answered yet. */
  unanswered: number;
}

/** An organization's insights, for its owner and admins on Business (PRD §71, §84). */
export interface OrgInsightsView {
  days: number;
  from: string;
  to: string;
  /** Conversations a customer wrote in. */
  conversations: number;
  /** Conversations that started. */
  newConversations: number;
  reply: ReplyTimesView;
  /** Customers waiting for an answer right now. */
  waitingNow: number;
  resolved: number;
  escalated: number;
  /** The same for the period before, to compare. */
  previous: {
    conversations: number;
    newConversations: number;
    medianReplyMinutes: number | null;
    resolved: number;
  };
}

/** A share: how many of how many, and the rate when there are any. */
export interface Rate {
  count: number;
  of: number;
  rate: number | null;
}

/**
 * The product's health for its operator (PRD §82–83): aggregate counts and rates only, never
 * about anyone in particular and never what anyone said.
 */
export interface ProductMetricsView {
  window: { from: string; to: string; days: number };
  people: { total: number; active7d: number; active28d: number };
  /** Of the people who signed up in the window. */
  activation: {
    signedUp: number;
    connected: Rate;
    messaged: Rate;
    classified: Rate;
    /** Classified a connection and sent a first message within a day of signing up. */
    activated: Rate;
  };
  engagement: {
    messages: number;
    activePeople: number;
    activeConversations: number;
    activeConnections: number;
  };
  core: {
    connectionCompletion: Rate;
    relationshipCompletion: Rate;
    waitingResolution: Rate;
    attentionResolution: Rate;
    notificationEfficiency: Rate;
    retention: { day7: Rate; day28: Rate };
    /** Of what Needs you asked people that they dealt with: answered, not "doesn't need me". */
    needsYouPrecision: Rate;
    /** Searches in the app that ended with something opened, and the median time it took. */
    informationRetrieval: { found: Rate; medianSeconds: number | null };
  };
  value: { tasksFromMessages: number; suggestionsAccepted: Rate };
  /** Of the people who signed up in the window, those who came through someone's link. */
  growth: {
    invited: Rate;
    viaOrganizations: number;
    /** Sign-ups through a person's link, per person active in the window. */
    kFactor: number | null;
  };
  ai: { calls: number; ok: number; byFeature: Record<string, { ok: number; other: number }> };
  business: {
    organizations: number;
    activeOrganizations: number;
    customerConversations: number;
    reply: ReplyTimesView;
  };
  /** What these numbers can't say yet, so nobody reads a gap as a zero. */
  notMeasured: string[];
}

/** Your own plan: what it includes, and what you've used of it. */
export interface PlanUsageView {
  plan: Plan;
  allowance: PersonAllowance;
  used: { aiToday: number; storageBytes: number };
  /** When the next AI assist is available again, once today's are used up. */
  aiNextAt: string | null;
  upgradeUrl: string | null;
}

/** A space in the list (PRD §40). */
export interface SpaceSummaryView {
  id: string;
  name: string;
  kind: SpaceKind;
  purpose: string | null;
  memberCount: number;
  /** Unread messages across the space's conversations you're in. */
  unreadCount: number;
  lastActivityAt: string;
  myRole: SpaceRole;
}

export interface SpaceMemberView {
  userId: string;
  role: SpaceRole;
  person: PersonView;
  /** How you know them, when you've said (private to you). */
  relationship: { label: string; sphere: Sphere } | null;
  joinedAt: string;
}

export interface SpaceConversationView {
  id: string;
  title: string;
  purpose: string | null;
  isGeneral: boolean;
  /** You're in it. Open conversations in a space can be joined by anyone in it. */
  joined: boolean;
  memberCount: number;
  unreadCount: number;
  lastMessageAt: string | null;
  /** Only for conversations you're in. */
  lastMessage: { preview: string; senderName: string | null; mine: boolean } | null;
}

export interface SpaceView extends SpaceSummaryView {
  createdAt: string;
  generalId: string;
  members: SpaceMemberView[];
  conversations: SpaceConversationView[];
}

/** AI assist for this account: the server has a provider, the person turned it on, and may. */
export interface AiStatusView {
  available: boolean;
  enabled: boolean;
  /** Adults only for now. */
  eligible: boolean;
}

/** Everything a model wrote carries `label` ("Suggested by Caishy") and waits for a tap (R17). */
export interface AiRewriteView {
  suggestion: string;
  label: string;
}

export interface AiTranslationView {
  translation: string;
  /** The language it was translated into, e.g. "en" and "English". */
  to: string;
  language: string;
  label: string;
}

export interface AiCatchUpView {
  /** Null when there is nothing to read yet. */
  summary: string | null;
  label: string | null;
  /** Messages since the reader last read, among those summarized. */
  newCount: number;
}

export interface AiActionsView {
  /** New suggestions, also in GET /suggestions; things already suggested or tracked are left out. */
  found: SuggestionView[];
  label: string;
}

export interface MemoryView {
  summary: string;
  people: Array<{ id: string; displayName: string; role: string }>;
  peopleLine: string;
  decisions: Array<{ id: string; title: string; messageId: string | null; decidedAt: string }>;
  openItems: TaskView[];
  dates: Array<{ text: string; at: string; messageId: string }>;
  amounts: Array<{ text: string; value: number; currency: string | null; messageId: string }>;
  documents: Array<{
    id: string;
    title: string | null;
    fileId: string | null;
    messageId: string | null;
  }>;
  links: Array<{ id: string; url: string | null; host: string | null; messageId: string | null }>;
  places: Array<{ id: string; title: string | null; messageId: string | null }>;
  topics: string[];
  counts: { messages: number; decisions: number; openItems: number };
  privacyClass: 'standard' | 'private';
}

export interface NotificationView {
  id: string;
  kind: string;
  level: NotificationLevel;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  count: number;
  delivery: string;
  reason: string | null;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationView[];
  unread: number;
}

export interface PolicyView extends RelationshipPolicy {
  description: string;
}

// --- Search ---------------------------------------------------------------------------------

export interface SearchMessageHit {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string | null;
  senderName: string | null;
  conversationTitle: string | null;
  /** The text around the match; matched words are marked for `snippetParts` (format.ts). */
  snippet: string;
  createdAt: string;
}

export interface SearchAssetHit {
  id: string;
  kind: string;
  url: string | null;
  host: string | null;
  title: string | null;
  conversationId: string;
  messageId: string | null;
  senderId: string | null;
  createdAt: string;
  file: FileView | null;
}

export interface SearchResults {
  people?: Array<{ person: PersonView; relationship: RelationshipView | null }>;
  organizations?: Array<{ name: string | null; people: number }>;
  messages?: SearchMessageHit[];
  files?: SearchAssetHit[];
  tasks?: TaskView[];
  decisions?: Array<{
    id: string;
    title: string;
    conversationId: string;
    messageId: string | null;
    decidedAt: string;
  }>;
  contexts?: Array<{
    conversationId: string;
    title: string | null;
    kind: string;
    context: { title: string; kind: string | null } | null;
  }>;
}

export interface SearchResponse {
  query: ParsedQuery;
  interpretation: ParsedQuery['interpretation'];
  results: SearchResults;
}

// --- Account --------------------------------------------------------------------------------

export interface AuthResponse {
  user: MeView;
  /** Native clients only; the web gets an httpOnly cookie instead. */
  token: string | null;
  /** Shown once, at sign-up. */
  recoveryCodes?: string[];
}

/** A signed-out client with no credentials gets nulls, not a 401. */
export type SessionResponse =
  | { user: MeView; session: { id: string; kind: string } }
  | { user: null; session: null };

export interface DeviceSessionView {
  id: string;
  kind: string;
  deviceName: string | null;
  platform: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

// --- Realtime -------------------------------------------------------------------------------

/** Events that carry data the client applies directly. */
export type RealtimeDataEvent =
  | { type: 'message.created' | 'message.updated'; data: MessageView }
  | { type: 'message.deleted' | 'message.hidden'; data: { id: string; conversationId: string } }
  | {
      type: 'message.sent';
      data: { conversationId: string; clientId: string; id: string; seq: number };
    }
  | {
      type: 'reaction';
      data: {
        messageId: string;
        conversationId: string;
        userId: string;
        emoji: string;
        added: boolean;
      };
    }
  | { type: 'poll.updated'; data: { messageId: string; conversationId: string } }
  | {
      type: 'receipts';
      data: {
        conversationId: string;
        userId: string;
        readSeq: number | null;
        deliveredSeq: number | null;
      };
    }
  | { type: 'typing'; data: { conversationId: string; userId: string } }
  | { type: 'call.ringing' | 'call.updated'; data: CallView }
  | { type: 'call.signal'; data: CallSignalView }
  | { type: 'groupcall.ringing' | 'groupcall.updated'; data: GroupCallView }
  | { type: 'groupcall.signal'; data: GroupCallSignalView }
  | { type: 'presence'; data: { userId: string; state: PresenceState; at: string } }
  /** Someone's devices for private conversations changed: seal for the new set (R18). */
  | { type: 'devices.changed'; data: { userId: string; conversationIds: string[] } }
  | {
      type: 'notification.created' | 'notification.updated';
      data: {
        id: string;
        kind?: string;
        level: NotificationLevel;
        title: string;
        body: string | null;
        count?: number;
        data: Record<string, unknown>;
      };
    };

/** Events that only say what changed; the client refetches. */
export type RealtimeSignalType =
  | 'space.updated'
  | 'space.removed'
  | 'conversation.created'
  | 'conversation.updated'
  | 'connection.created'
  | 'connection.updated'
  | 'connection.removed'
  | 'connection.request'
  | 'connection.request.resolved'
  | 'relationship.changed'
  | 'relationship.shared'
  | 'policies.changed'
  | 'suggestion.created'
  | 'suggestion.resolved'
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'decision.created'
  | 'decision.updated'
  | 'notifications.read'
  | 'block.changed'
  | 'me.updated'
  | 'business.updated'
  /** An organization someone follows (or whose team they're on) posted, changed or took back an update. */
  | 'updates.changed';

export type RealtimeEvent =
  | RealtimeDataEvent
  | { type: RealtimeSignalType; data: Record<string, unknown> };

export type RealtimeFrame =
  | { type: 'hello'; userId: string; serverTime: string }
  | { type: 'pong'; serverTime: string }
  | { type: 'event'; event: RealtimeEvent };

/** A personal access token, as its owner sees it: never the token itself after it's made. */
export interface PersonalTokenView {
  id: string;
  name: string;
  scopes: string[];
  /** The first characters, to tell tokens apart. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

/** A third-party app its developer registered (PRD §74): never its secret after it's made. */
export interface OAuthAppView {
  id: string;
  clientId: string;
  name: string;
  website: string | null;
  redirectUris: string[];
  /** It keeps a secret on a server; otherwise it proves itself with PKCE alone. */
  confidential: boolean;
  createdAt: string;
}

/** What someone is asked when an app wants to act for them. */
export interface OAuthConsentView {
  app: { name: string; website: string | null; owner: { displayName: string; handle: string } };
  scopes: Array<{ scope: string; label: string }>;
  redirectUri: string;
  /** They let it in before, with at least these permissions. */
  allowedBefore: boolean;
}

/** An app someone let act for them, and what it may do. */
export interface ConnectedAppView {
  grantId: string;
  name: string;
  website: string | null;
  owner: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/** A call (PRD §47), as either side sees it. */
export interface CallView {
  id: string;
  conversationId: string;
  kind: CallKind;
  state: CallState;
  outcome: CallOutcome | null;
  caller: { id: string; displayName: string; avatarUrl: string | null };
  callee: { id: string; displayName: string; avatarUrl: string | null };
  /** The device on each side that's in it: signals go only between these two. */
  callerDevice: string;
  calleeDevice: string | null;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

/** Someone in a call, as the viewer may see them. */
export interface CallPersonView {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** A call in a group conversation (PRD §47): who's in it, and on which device. */
export interface GroupCallView {
  id: string;
  conversationId: string;
  /** The group's name, for the call screen. */
  conversationTitle: string | null;
  kind: CallKind;
  /** Ringing until a second person joins; active while two or more are in it. */
  state: CallState;
  /** Goes up with every change to who's in it: a view with a lower one is older news. */
  rev: number;
  outcome: CallOutcome | null;
  startedBy: CallPersonView;
  /**
   * Who's in it (joined), and the viewer's own place in it: never who else was rung, turned it
   * down or missed it, nor whether anyone still is.
   */
  members: Array<{
    person: CallPersonView;
    state: GroupCallMemberState;
    /**
     * The device they're in it on, while they are, shown only to someone in it too: signals go
     * only between these.
     */
    device: string | null;
    joinedAt: string | null;
  }>;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

/** A group call's signal says whose device it's from too: it's that device of that person. */
export interface GroupCallSignalView extends CallSignalView {
  fromUser: string;
}

/** One call in someone's history (PRD §47): a 1:1 or a group call, as it went for them. */
export interface CallHistoryItem {
  id: string;
  conversationId: string;
  /** The group's name, for a group call. */
  conversationTitle: string | null;
  kind: CallKind;
  group: boolean;
  /** They called, or were called. */
  direction: 'outgoing' | 'incoming';
  result: CallResult;
  /**
   * Who else: the other person, or those in the group call with them; for a group call nobody
   * else joined, whoever started it (none, to them).
   */
  with: CallPersonView[];
  /** How long it lasted, if it was answered. */
  seconds: number;
  createdAt: string;
  endedAt: string | null;
}

export interface CallHistoryResponse {
  calls: CallHistoryItem[];
  /** Pass as `before` for the next page; null at the end. */
  nextBefore: string | null;
}

/**
 * A device that reads private conversations (R18), as anyone writing to it gets it: its keys,
 * and who vouched for it (the device of the same person that approved it, or itself, the first).
 */
export interface DeviceView {
  id: string;
  userId: string;
  encryptionKey: PublicJwk;
  signingKey: PublicJwk;
  introducedBy: string | null;
  introduction: string;
}

/** A private conversation's devices, to seal for, and the chains that vouch for them. */
export interface ConversationDevicesView {
  /** Who's in it now. */
  people: string[];
  /** Everyone's devices that read it now (approved, signed in). */
  devices: DeviceView[];
  /** Devices asked for by id (past senders), and every device that introduced one listed. */
  chain: DeviceView[];
}

/** One of my own devices, for Settings: which it is, when it was added, and if it's approved. */
export interface MyDeviceView extends DeviceView {
  name: string | null;
  /** This is the device asking. */
  current: boolean;
  createdAt: string;
  /** Approved by one of my devices (or the first): until then nothing is sealed for it. */
  approved: boolean;
}

/** How two devices reach each other (WebRTC), passed from one to the other. */
export interface CallSignalView {
  callId: string;
  from: string;
  to: string;
  kind: 'offer' | 'answer' | 'candidate';
  sdp: string | null;
  candidate: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
    usernameFragment: string | null;
  } | null;
}

/** Where a device finds its way to the other: STUN, and a relay when one is set up. */
export interface IceConfigView {
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }>;
  relay: boolean;
}
