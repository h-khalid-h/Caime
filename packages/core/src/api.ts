/**
 * The API contract (docs/ARCHITECTURE.md "API conventions"): every response shape the server
 * returns and the clients read. The server's view builders are annotated with these types, so a
 * field that drifts on either side is a compile error in both packages. Request bodies are the
 * zod schemas in ./schemas; everything here is a response. Types only: nothing here ships code.
 */
import type { z } from 'zod';
import type { AttentionReason, AttentionSection } from './attention';
import type { OrgKind, OrgRole } from './orgs';
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

export interface MessageView {
  id: string;
  conversationId: string;
  seq: number;
  /** Only for the sender's own messages: the id their device chose, for reconciling echoes. */
  clientId: string | null;
  senderId: string | null;
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
  /** relationship · topic · task · reminder · waiting · decision (R12: never a fact). */
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
  | { type: 'presence'; data: { userId: string; state: PresenceState; at: string } }
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
  | 'me.updated';

export type RealtimeEvent =
  | RealtimeDataEvent
  | { type: RealtimeSignalType; data: Record<string, unknown> };

export type RealtimeFrame =
  | { type: 'hello'; userId: string; serverTime: string }
  | { type: 'pong'; serverTime: string }
  | { type: 'event'; event: RealtimeEvent };
