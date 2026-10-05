/**
 * Kysely table types for the SQL in ./migrations. Keep in step with the migrations: a column
 * added there is added here in the same commit.
 */
import type {
  BookingHours,
  BookingItem,
  CatalogCollection,
  CustomKitDef,
  OrderingSettings,
  PaymentSettings,
} from '@caime/core';
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;
type Json<T = unknown> = ColumnType<T, T | string, T | string>;
/** A jsonb column with a database default. */
type JsonDefaulted<T> = ColumnType<T, T | string | undefined, T | string>;
type Defaulted<T> = ColumnType<T, T | undefined, T>;
/** bigint counters: pg returns strings; numbers are accepted on write. */
type BigIntCol = ColumnType<string, string | number | undefined, string | number>;

export interface UsersTable {
  id: string;
  email: string;
  email_verified_at: NullableTimestamp;
  handle: string;
  password_hash: string;
  display_name: string;
  kind: Defaulted<'human' | 'bot' | 'agent'>;
  /** 'YYYY-MM-DD'; every person has one (0034), an app or an agent doesn't. */
  birth_date: string | null;
  locale: Defaulted<string>;
  time_zone: Defaulted<string>;
  /** Where they live (ISO 3166-1): it sets their defaults (lib/geo.ts). */
  country: string | null;
  workweek: Defaulted<number[]>;
  quiet_hours: Json<{ days: number[]; start: string; end: string } | null> | null;
  plan: Defaulted<'personal' | 'pro' | 'business' | 'enterprise'>;
  /** Where the plan came from: billing changes only its own, or the default. */
  plan_source: Defaulted<PlanSource>;
  avatar_file_id: string | null;
  bio: string | null;
  pronouns: string | null;
  status_text: string | null;
  status_emoji: string | null;
  presence: Defaulted<'auto' | 'available' | 'busy' | 'away' | 'invisible'>;
  last_active_at: NullableTimestamp;
  privacy: Json;
  preferences: JsonDefaulted<Record<string, unknown>>;
  /** Their bookable hours and catalog (R58), as an organization's. */
  booking: Json<BookingHours | null> | null;
  booking_items: JsonDefaulted<BookingItem[]>;
  /** How it takes orders (R60), or null: core `OrderingSettings`. */
  ordering: Json<OrderingSettings | null> | null;
  collections: JsonDefaulted<CatalogCollection[]>;
  payments: Json<PaymentSettings | null> | null;
  ai_enabled: Defaulted<boolean>;
  onboarded_at: NullableTimestamp;
  /** When they said their recovery codes are saved (R56); null while the app still asks. */
  recovery_codes_seen_at: NullableTimestamp;
  /** The @handle link that brought them: a person's, or an organization's. */
  invited_by: string | null;
  invited_by_org: string | null;
  /** Suspended by the operator (R49): every way in closed until lifted; nothing removed. */
  suspended_at: NullableTimestamp;
  suspended_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: NullableTimestamp;
}

export interface IdentitiesTable {
  id: string;
  user_id: string;
  kind: 'personal' | 'professional' | 'organization';
  display_name: string;
  headline: string | null;
  org_id: string | null;
  org_name: string | null;
  is_default: Defaulted<boolean>;
  created_at: Generated<Date>;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  token_hash: Buffer;
  kind: 'web' | 'native' | 'api';
  device_name: string | null;
  platform: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
  last_seen_at: Generated<Date>;
  expires_at: Timestamp;
  revoked_at: NullableTimestamp;
}

/** The code sent to confirm an email address (R48): one per person at a time, hashed. */
export interface EmailCodesTable {
  user_id: string;
  code_hash: Buffer;
  attempts: Defaulted<number>;
  expires_at: Date;
  created_at: Generated<Date>;
}

/** A link to reset a forgotten password (R48): hashed, an hour, once. */
export interface PasswordResetsTable {
  id: string;
  user_id: string;
  token_hash: Buffer;
  expires_at: Date;
  used_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface RecoveryCodesTable {
  id: string;
  user_id: string;
  code_hash: Buffer;
  /** The account's salt for its slow hashes. */
  salt: Buffer;
  used_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface ConnectionsTable {
  id: string;
  user_a: string;
  user_b: string;
  status: Defaulted<'active' | 'removed'>;
  created_at: Generated<Date>;
  removed_at: NullableTimestamp;
}

export type AttentionOverride = 'auto' | 'priority' | 'normal' | 'quiet';

export interface ConnectionSidesTable {
  connection_id: string;
  owner_id: string;
  other_id: string;
  identity_id: string | null;
  nickname: string | null;
  note: string | null;
  attention: Defaulted<AttentionOverride>;
  muted_until: NullableTimestamp;
  archived_at: NullableTimestamp;
  last_interaction_at: NullableTimestamp;
  /** The owner said this person is the same as another connection of theirs (PRD §51). */
  merged_into: Defaulted<string | null>;
  created_at: Generated<Date>;
}

export interface ConnectionRequestsTable {
  id: string;
  from_user: string;
  to_user: string;
  note: string | null;
  context_sphere: string | null;
  context_org_name: string | null;
  from_identity_id: string | null;
  pending_relationship: Json | null;
  status: Defaulted<'pending' | 'accepted' | 'declined' | 'cancelled'>;
  created_at: Generated<Date>;
  responded_at: NullableTimestamp;
}

/** An invite link (R1, 0044): the inviter's standing offer to connect with whoever opens it. */
export interface InvitesTable {
  id: string;
  user_id: string;
  token: string;
  relationship: Json | null;
  context_sphere: string | null;
  context_org_name: string | null;
  note: string | null;
  uses: Defaulted<number>;
  expires_at: Date;
  revoked_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface CustomRolesTable {
  id: string;
  user_id: string;
  sphere: string;
  label: string;
  created_at: Generated<Date>;
}

export type RelationshipStatus = 'active' | 'ended' | 'archived' | 'superseded' | 'merged';

export interface RelationshipsTable {
  id: string;
  owner_id: string;
  subject_id: string;
  connection_id: string | null;
  sphere: string;
  role: string | null;
  role_label: string | null;
  org_id: string | null;
  org_name: string | null;
  context_note: string | null;
  status: Defaulted<RelationshipStatus>;
  is_primary: Defaulted<boolean>;
  shared: Defaulted<boolean>;
  source: Defaulted<'user' | 'suggestion' | 'invite' | 'template' | 'import'>;
  superseded_by: string | null;
  started_at: Generated<Date>;
  ended_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RelationshipEventsTable {
  id: string;
  relationship_id: string;
  owner_id: string;
  kind:
    | 'created'
    | 'changed'
    | 'ended'
    | 'archived'
    | 'restored'
    | 'merged'
    | 'shared'
    | 'unshared';
  before: Json | null;
  after: Json | null;
  at: Generated<Date>;
}

export interface RelationshipPoliciesTable {
  id: string;
  user_id: string;
  name: string | null;
  scope_sphere: string | null;
  scope_role: string | null;
  scope_org_id: string | null;
  scope_connection_id: string | null;
  settings: Json<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SuggestionsTable {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  rationale: string;
  confidence: number;
  payload: JsonDefaulted<Record<string, unknown>>;
  conversation_id: string | null;
  message_id: string | null;
  subject_user_id: string | null;
  due_at: NullableTimestamp;
  due_text: string | null;
  status: Defaulted<'pending' | 'accepted' | 'dismissed' | 'expired'>;
  result_ref: Json | null;
  fingerprint: string;
  created_at: Generated<Date>;
  resolved_at: NullableTimestamp;
}

export interface ContextsTable {
  id: string;
  created_by: string | null;
  kind:
    | 'project'
    | 'order'
    | 'trip'
    | 'appointment'
    | 'school'
    | 'event'
    | 'contract'
    | 'issue'
    | 'family'
    | 'other';
  title: string;
  purpose: string | null;
  status: Defaulted<'active' | 'done' | 'archived'>;
  deadline_at: NullableTimestamp;
  external_ref: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type PlanSource = 'default' | 'operator' | 'billing';

export type ConversationKind = 'direct' | 'group' | 'business' | 'community' | 'broadcast';

export interface ConversationsTable {
  id: string;
  kind: ConversationKind;
  title: string | null;
  purpose: string | null;
  avatar_file_id: string | null;
  direct_key: string | null;
  connection_id: string | null;
  is_general: Defaulted<boolean>;
  parent_id: string | null;
  context_id: string | null;
  space_id: string | null;
  org_id: string | null;
  privacy_class: Defaulted<'standard' | 'private'>;
  temporary_until: NullableTimestamp;
  retention_days: number | null;
  created_by: string | null;
  last_seq: BigIntCol;
  last_message_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ParticipantsTable {
  conversation_id: string;
  user_id: string;
  role: Defaulted<'owner' | 'admin' | 'member' | 'guest' | 'agent'>;
  identity_id: string | null;
  joined_at: Generated<Date>;
  left_at: NullableTimestamp;
  last_read_seq: BigIntCol;
  last_delivered_seq: BigIntCol;
  attention: Defaulted<AttentionOverride>;
  muted_until: NullableTimestamp;
  archived_at: NullableTimestamp;
  pinned_at: NullableTimestamp;
  request_state: 'pending' | 'accepted' | 'declined' | null;
  dismissed_seq: BigIntCol;
  draft: string | null;
  draft_updated_at: NullableTimestamp;
}

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

export interface MessagesTable {
  id: string;
  conversation_id: string;
  /** bigint arrives as a string from pg; converted at the edge. */
  seq: ColumnType<string, string | number, string | number>;
  sender_id: string | null;
  client_id: string | null;
  kind: MessageKind;
  body: string | null;
  payload: JsonDefaulted<Record<string, unknown>>;
  mode: Defaulted<string>;
  mode_source: Defaulted<'auto' | 'user'>;
  entities: JsonDefaulted<Record<string, unknown>>;
  mentions: Defaulted<string[]>;
  reply_to_id: string | null;
  forwarded_from_id: string | null;
  urgent: Defaulted<boolean>;
  is_question: Defaulted<boolean>;
  is_request: Defaulted<boolean>;
  edited_at: NullableTimestamp;
  deleted_at: NullableTimestamp;
  /** When it disappears: the conversation's setting when it was sent (0032). */
  expires_at: NullableTimestamp;
  created_at: Generated<Date>;
  search: ColumnType<string, never, never>;
  /** What sent it when its sender didn't type it in Caime: their token's name, or an app's. */
  sent_via: string | null;
  /** In a private conversation (R18): the message as an envelope only its devices can open. */
  sealed: Json<Record<string, unknown>> | null;
  /** Kept at the conversation's top for everyone in it (PRD §22), and by whom. */
  pinned_at: NullableTimestamp;
  pinned_by: string | null;
}

export interface ReactionsTable {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: Generated<Date>;
}

export interface FilesTable {
  id: string;
  owner_id: string | null;
  storage_key: string;
  name: string;
  mime: string;
  size: ColumnType<string, string | number, string | number>;
  kind: 'image' | 'video' | 'audio' | 'document' | 'other';
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  sha256: string | null;
  thumb_key: string | null;
  status: Defaulted<'uploading' | 'ready' | 'failed'>;
  upload_offset: BigIntCol;
  created_at: Generated<Date>;
}

export interface MessageFilesTable {
  message_id: string;
  file_id: string;
  position: Defaulted<number>;
}

export type AssetKind = 'photo' | 'video' | 'document' | 'audio' | 'link' | 'location' | 'contact';

export interface AssetsTable {
  id: string;
  conversation_id: string;
  message_id: string | null;
  sender_id: string | null;
  kind: AssetKind;
  file_id: string | null;
  url: string | null;
  title: string | null;
  host: string | null;
  created_at: Generated<Date>;
}

/** Automations (PRD §69): what someone set Caime to keep of what arrives. */
export interface AutomationsTable {
  id: string;
  user_id: string;
  name: string | null;
  scope_sphere: string | null;
  scope_role: string | null;
  kinds: string[];
  words: Generated<string[]>;
  collection: string;
  enabled: Generated<boolean>;
  runs: Generated<number>;
  last_run_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * A handle someone let go of, held from everyone until `held_until` (lib/handles.ts): the handle
 * and the days ('YYYY-MM-DD', UTC), never whose it was.
 */
export interface ReleasedHandlesTable {
  handle: string;
  released_on: string;
  held_until: string;
}

/** A message, or one file or link of it, kept in one of someone's collections. */
export interface SavedItemsTable {
  id: string;
  user_id: string;
  collection: string;
  conversation_id: string;
  message_id: string;
  asset_id: string | null;
  automation_id: string | null;
  created_at: Generated<Date>;
}

export type TaskStatus = 'open' | 'accepted' | 'declined' | 'done' | 'cancelled';

export interface TasksTable {
  id: string;
  owner_id: string;
  assignee_id: string | null;
  shared: Defaulted<boolean>;
  title: string;
  notes: string | null;
  status: Defaulted<TaskStatus>;
  due_at: NullableTimestamp;
  due_has_time: Defaulted<boolean>;
  remind_at: NullableTimestamp;
  reminded_at: NullableTimestamp;
  conversation_id: string | null;
  message_id: string | null;
  context_id: string | null;
  relationship_snapshot: Json | null;
  source: Defaulted<'manual' | 'suggestion' | 'request' | 'import' | 'kit'>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  completed_at: NullableTimestamp;
  completed_by: string | null;
  /** The device's own id for a task made offline, so a retry is the same task. */
  client_id: string | null;
  search: ColumnType<string, never, never>;
}

/** A person's calendar feed (PRD §72): the hash of the secret in its address. */
export interface CalendarFeedsTable {
  user_id: string;
  token_hash: Buffer;
  created_at: Generated<Date>;
  last_read_at: Date | null;
}

export interface DecisionsTable {
  id: string;
  conversation_id: string;
  message_id: string | null;
  context_id: string | null;
  title: string;
  notes: string | null;
  decided_by: string | null;
  recorded_by: string | null;
  decided_at: Generated<Date>;
  status: Defaulted<'active' | 'reversed'>;
  created_at: Generated<Date>;
  search: ColumnType<string, never, never>;
}

export interface NotificationsTable {
  id: string;
  user_id: string;
  kind: string;
  level: 'activity' | 'attention' | 'urgency';
  title: string;
  body: string | null;
  data: JsonDefaulted<Record<string, unknown>>;
  /** The messages whose words it shows (0032): it goes when they do. */
  quotes: Defaulted<string[]>;
  group_key: string | null;
  count: Defaulted<number>;
  delivery: Defaulted<'push' | 'silent' | 'held'>;
  hold_until: NullableTimestamp;
  reason: string | null;
  pushed_at: NullableTimestamp;
  read_at: NullableTimestamp;
  dismissed_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PushSubscriptionsTable {
  id: string;
  user_id: string;
  session_id: string | null;
  kind: 'webpush' | 'expo';
  endpoint: string;
  keys: Json | null;
  created_at: Generated<Date>;
  last_success_at: NullableTimestamp;
  failures: Defaulted<number>;
}

export interface BlocksTable {
  blocker_id: string;
  blocked_id: string;
  created_at: Generated<Date>;
}

export interface AlbumPhotosTable {
  message_id: string;
  file_id: string;
  added_by: string | null;
  created_at: Generated<Date>;
}

export interface OrgBlocksTable {
  user_id: string;
  org_id: string;
  created_at: Generated<Date>;
}

/** An organization's update (PRD §59), posted to whoever follows it. */
export interface OrgUpdatesTable {
  id: string;
  org_id: string;
  posted_by: string | null;
  body: string;
  client_id: Defaulted<string | null>;
  created_at: Generated<Date>;
  edited_at: NullableTimestamp;
  deleted_at: NullableTimestamp;
}

/** Someone following an organization's updates: neither a connection nor a conversation. */
export interface OrgFollowsTable {
  user_id: string;
  org_id: string;
  notify: Defaulted<boolean>;
  read_at: Generated<Date>;
  created_at: Generated<Date>;
}

export interface ReportsTable {
  id: string;
  reporter_id: string | null;
  target_user_id: string | null;
  message_id: string | null;
  conversation_id: string | null;
  org_id: Defaulted<string | null>;
  update_id: Defaulted<string | null>;
  reason: string;
  details: string | null;
  status: Defaulted<'open' | 'reviewing' | 'actioned' | 'dismissed'>;
  created_at: Generated<Date>;
}

export interface DomainEventsTable {
  id: Generated<string>;
  type: string;
  actor_id: string | null;
  payload: Json<Record<string, unknown>>;
  created_at: Generated<Date>;
}

export interface JobsTable {
  id: Generated<string>;
  kind: string;
  payload: JsonDefaulted<Record<string, unknown>>;
  run_at: Defaulted<Date>;
  attempts: Defaulted<number>;
  max_attempts: Defaulted<number>;
  locked_at: NullableTimestamp;
  locked_by: string | null;
  last_error: string | null;
  done_at: NullableTimestamp;
  dedupe_key: string | null;
  created_at: Generated<Date>;
}

export interface AuditLogTable {
  id: Generated<string>;
  actor_id: string | null;
  action: string;
  target: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: JsonDefaulted<Record<string, unknown>>;
  created_at: Generated<Date>;
}

export interface AiRunsTable {
  id: string;
  user_id: string | null;
  feature: string;
  provider: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  /** Of the input, what was read from the model's cache, and what was written to it (0051). */
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  latency_ms: number | null;
  outcome: string;
  /** The conversation the AI agent was answering in, for its per-conversation bound. */
  conversation_id: string | null;
  /** Its answer was thrown away, never sent: the call counts, the answer doesn't. */
  discarded_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface PollVotesTable {
  message_id: string;
  user_id: string;
  option_id: string;
  created_at: Generated<Date>;
}

export interface HiddenMessagesTable {
  message_id: string;
  user_id: string;
  created_at: Generated<Date>;
}

export type SpaceKind =
  | 'family'
  | 'friends'
  | 'team'
  | 'project'
  | 'community'
  | 'school'
  | 'other';
export type SpaceRole = 'owner' | 'admin' | 'member';

export interface SpacesTable {
  id: string;
  name: string;
  purpose: string | null;
  kind: SpaceKind;
  created_by: string | null;
  /** The organization it belongs to (R43), if one. */
  org_id: string | null;
  archived_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SpaceMembersTable {
  space_id: string;
  user_id: string;
  role: Defaulted<SpaceRole>;
  added_by: string | null;
  joined_at: Generated<Date>;
  left_at: NullableTimestamp;
}

export type OrgKind =
  | 'business'
  | 'shop'
  | 'clinic'
  | 'school'
  | 'nonprofit'
  | 'public_service'
  | 'other';
export type OrgRole = 'owner' | 'admin' | 'agent';
export type OrgPlan = 'free' | 'business' | 'enterprise';

export interface OrganizationsTable {
  id: string;
  name: string;
  handle: string;
  kind: OrgKind;
  about: string | null;
  website: string | null;
  domain: string | null;
  verify_token: string | null;
  verified_at: NullableTimestamp;
  created_by: string | null;
  archived_at: NullableTimestamp;
  plan: Defaulted<OrgPlan>;
  plan_source: Defaulted<PlanSource>;
  /** Where it's based (ISO 3166-1), for its defaults (lib/geo.ts). */
  country: string | null;
  /** The year it began, shown on its page if it says. */
  founded_year: number | null;
  /** Its logo: an image its owner or an admin uploaded. */
  avatar_file_id: string | null;
  /** Its bookable hours (R51), or null: core `BookingHours`. */
  booking: Json<BookingHours | null> | null;
  /** What can be booked in them (R58): core `BookingItem[]`. */
  booking_items: JsonDefaulted<BookingItem[]>;
  /** How it takes orders (R60), or null: core `OrderingSettings`. */
  ordering: Json<OrderingSettings | null> | null;
  collections: JsonDefaulted<CatalogCollection[]>;
  payments: Json<PaymentSettings | null> | null;
  /** How long it keeps its customers' conversations (R54), in days; null keeps them. */
  retention_days: number | null;
  /** Closed: who is proving its domain to take it back (R42), and the record they must add. */
  reclaim_by: string | null;
  reclaim_token: string | null;
  /** Closed and taken back: the open organization that continues it. */
  succeeded_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrgMembersTable {
  org_id: string;
  user_id: string;
  role: Defaulted<OrgRole>;
  title: string | null;
  added_by: string | null;
  joined_at: Generated<Date>;
  left_at: NullableTimestamp;
}

export interface BusinessThreadsTable {
  conversation_id: string;
  org_id: string;
  customer_id: string | null;
  assignee_id: string | null;
  escalated_at: NullableTimestamp;
  escalated_by: string | null;
  escalation_note: string | null;
  resolved_at: NullableTimestamp;
  resolved_by: string | null;
  last_customer_seq: ColumnType<string, string | number | undefined, string | number>;
  last_team_seq: ColumnType<string, string | number | undefined, string | number>;
  last_customer_at: NullableTimestamp;
  last_team_at: NullableTimestamp;
  team_read_seq: ColumnType<string, string | number | undefined, string | number>;
  /** The team wrote first (R14); counted against the plan's starts. */
  started_by_team: Defaulted<boolean>;
  /** Erased at the customer's request (R54): when, and who on the team did it. */
  erased_at: NullableTimestamp;
  erased_by: string | null;
  /** The customer message its AI agent last dealt with (PRD §75), so it deals with each once. */
  agent_seq: ColumnType<string, string | number | undefined, string | number>;
  /** Its AI agent handed it to the team: it stays out until the conversation is resolved. */
  agent_handed_over_at: NullableTimestamp;
  /** The customer last wrote to it resolved: a new question since whoever has it last wrote. */
  reopened_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A 1:1 call (PRD §47): who, how, and how it went. The media never passes through here. */
export interface CallsTable {
  id: string;
  conversation_id: string;
  caller_id: string | null;
  callee_id: string | null;
  kind: 'voice' | 'video';
  state: 'ringing' | 'active' | 'ended';
  outcome: 'completed' | 'missed' | 'declined' | 'cancelled' | 'failed' | null;
  caller_device: string;
  callee_device: string | null;
  created_at: Date;
  answered_at: NullableTimestamp;
  ended_at: NullableTimestamp;
  /** The last time either side said it was there. */
  seen_at: Date;
  /** Each side on its own: a call ends when either stops saying it's there. */
  caller_seen_at: Generated<Date>;
  callee_seen_at: NullableTimestamp;
  /** False for a call placed while they were busy and hidden: it rings only for the caller. */
  callee_rung: Generated<boolean>;
  /** A call in a group conversation: its people are in call_members, and it has no callee. */
  is_group: Generated<boolean>;
  /** A group call's revision: up by one with every change to who's in it. */
  rev: Generated<number>;
}

/** A device's public keys for private conversations (R18), tied to the session it signed in with. */
export interface E2eeDevicesTable {
  id: string;
  user_id: string;
  session_id: string | null;
  name: string | null;
  encryption_key: Json;
  signing_key: Json;
  introduced_by: string | null;
  introduction: string;
  approved_at: NullableTimestamp;
  created_at: Generated<Date>;
  revoked_at: NullableTimestamp;
  /** A device signed in somewhere, or the person's recovery device (R41). */
  kind: Generated<'device' | 'recovery'>;
}

/** Where each person in a group call is (PRD §47). */
export interface CallMembersTable {
  call_id: string;
  user_id: string;
  state: 'ringing' | 'joined' | 'left' | 'declined' | 'missed';
  device: string | null;
  rung_at: Generated<Date>;
  joined_at: NullableTimestamp;
  left_at: NullableTimestamp;
  seen_at: NullableTimestamp;
}

/** Which Stripe customer is whose (R25): a person's, or an organization's. */
export interface BillingCustomersTable {
  id: string;
  livemode: boolean;
  user_id: string | null;
  org_id: string | null;
  created_at: Generated<Date>;
  closed_at: NullableTimestamp;
}

/** Where each subscription stands, as Stripe last said. */
export interface BillingSubscriptionsTable {
  id: string;
  customer_id: string;
  plan: 'pro' | 'business';
  interval: 'month' | 'year';
  status: string;
  amount: number | null;
  currency: string | null;
  current_period_end: NullableTimestamp;
  cancel_at_period_end: Defaulted<boolean>;
  updated_at: Generated<Date>;
}

/** Stripe's events, each handled once. */
export interface BillingEventsTable {
  id: string;
  type: string;
  received_at: Generated<Date>;
}

/** An organization's AI agent (PRD §74–75): one per organization, answering as its own user. */
export interface OrgAgentsTable {
  org_id: string;
  bot_user_id: string;
  knowledge: string;
  paused_at: NullableTimestamp;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrgAppsTable {
  id: string;
  org_id: string;
  name: string;
  bot_user_id: string | null;
  scopes: Defaulted<string[]>;
  webhook_url: string | null;
  webhook_secret: string;
  /** The secret before the last replacement, still signing deliveries until `…_until` (0052). */
  previous_webhook_secret: string | null;
  previous_secret_until: NullableTimestamp;
  events: Defaulted<string[]>;
  created_by: string | null;
  created_at: Generated<Date>;
  revoked_at: NullableTimestamp;
}

/** An app's own kind of card (PRD §74, §86): its definition as core's parseCustomKit left it. */
export interface AppKitsTable {
  id: string;
  app_id: string;
  org_id: string;
  key: string;
  definition: Json<CustomKitDef>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ApiTokensTable {
  id: string;
  app_id: string;
  prefix: string;
  token_hash: Buffer;
  last_used_at: NullableTimestamp;
  created_at: Generated<Date>;
  revoked_at: NullableTimestamp;
}

export interface WebhookDeliveriesTable {
  id: string;
  app_id: string;
  event: string;
  payload: Json;
  status: Defaulted<'pending' | 'delivered' | 'failed'>;
  attempts: Defaulted<number>;
  last_status: number | null;
  last_error: string | null;
  created_at: Generated<Date>;
  delivered_at: NullableTimestamp;
}

export interface ServerSettingsTable {
  key: string;
  value: Json;
  updated_at: Generated<Date>;
}

export interface PersonalTokensTable {
  id: string;
  user_id: string;
  name: string;
  scopes: string[];
  prefix: string;
  token_hash: Buffer;
  expires_at: NullableTimestamp;
  last_used_at: NullableTimestamp;
  created_at: Generated<Date>;
  revoked_at: NullableTimestamp;
}

export interface OAuthClientsTable {
  id: string;
  client_id: string;
  owner_id: string;
  name: string;
  website: string | null;
  redirect_uris: string[];
  secret_hash: Buffer | null;
  created_at: Generated<Date>;
  revoked_at: NullableTimestamp;
}

export interface OAuthGrantsTable {
  id: string;
  client_id: string;
  user_id: string;
  scopes: string[];
  last_used_at: NullableTimestamp;
  created_at: Generated<Date>;
  revoked_at: NullableTimestamp;
}

export interface OAuthCodesTable {
  code_hash: Buffer;
  grant_id: string;
  redirect_uri: string;
  code_challenge: string;
  scopes: string[];
  expires_at: Date;
  used_at: NullableTimestamp;
}

export interface OAuthTokensTable {
  id: string;
  grant_id: string;
  kind: 'access' | 'refresh';
  token_hash: Buffer;
  scopes: string[];
  expires_at: Date;
  created_at: Generated<Date>;
  used_at: NullableTimestamp;
  revoked_at: NullableTimestamp;
}

export interface Database {
  users: UsersTable;
  identities: IdentitiesTable;
  sessions: SessionsTable;
  recovery_codes: RecoveryCodesTable;
  email_codes: EmailCodesTable;
  password_resets: PasswordResetsTable;
  connections: ConnectionsTable;
  connection_sides: ConnectionSidesTable;
  connection_requests: ConnectionRequestsTable;
  invites: InvitesTable;
  custom_roles: CustomRolesTable;
  relationships: RelationshipsTable;
  relationship_events: RelationshipEventsTable;
  relationship_policies: RelationshipPoliciesTable;
  suggestions: SuggestionsTable;
  contexts: ContextsTable;
  conversations: ConversationsTable;
  participants: ParticipantsTable;
  messages: MessagesTable;
  reactions: ReactionsTable;
  files: FilesTable;
  message_files: MessageFilesTable;
  assets: AssetsTable;
  automations: AutomationsTable;
  saved_items: SavedItemsTable;
  released_handles: ReleasedHandlesTable;
  tasks: TasksTable;
  calendar_feeds: CalendarFeedsTable;
  decisions: DecisionsTable;
  notifications: NotificationsTable;
  push_subscriptions: PushSubscriptionsTable;
  blocks: BlocksTable;
  org_blocks: OrgBlocksTable;
  org_updates: OrgUpdatesTable;
  org_follows: OrgFollowsTable;
  album_photos: AlbumPhotosTable;
  personal_tokens: PersonalTokensTable;
  oauth_clients: OAuthClientsTable;
  oauth_grants: OAuthGrantsTable;
  oauth_codes: OAuthCodesTable;
  oauth_tokens: OAuthTokensTable;
  reports: ReportsTable;
  domain_events: DomainEventsTable;
  jobs: JobsTable;
  audit_log: AuditLogTable;
  ai_runs: AiRunsTable;
  server_settings: ServerSettingsTable;
  poll_votes: PollVotesTable;
  hidden_messages: HiddenMessagesTable;
  spaces: SpacesTable;
  space_members: SpaceMembersTable;
  organizations: OrganizationsTable;
  org_members: OrgMembersTable;
  business_threads: BusinessThreadsTable;
  org_apps: OrgAppsTable;
  app_kits: AppKitsTable;
  org_agents: OrgAgentsTable;
  calls: CallsTable;
  call_members: CallMembersTable;
  e2ee_devices: E2eeDevicesTable;
  billing_customers: BillingCustomersTable;
  billing_subscriptions: BillingSubscriptionsTable;
  billing_events: BillingEventsTable;
  api_tokens: ApiTokensTable;
  webhook_deliveries: WebhookDeliveriesTable;
}

export type User = Selectable<UsersTable>;
export type WebhookDelivery = Selectable<WebhookDeliveriesTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Relationship = Selectable<RelationshipsTable>;
export type Conversation = Selectable<ConversationsTable>;
export type Participant = Selectable<ParticipantsTable>;
/**
 * Every column of a message but `search`, the tsvector only the search query reads: a message
 * is selected with these (`.select(MESSAGE_COLUMNS)`), never `selectAll()`, which shipped the
 * vector with every row read (`messaging.test.ts` holds this list to the table).
 */
export const MESSAGE_COLUMNS = [
  'id',
  'conversation_id',
  'seq',
  'sender_id',
  'client_id',
  'kind',
  'body',
  'payload',
  'mode',
  'mode_source',
  'entities',
  'mentions',
  'reply_to_id',
  'forwarded_from_id',
  'urgent',
  'is_question',
  'is_request',
  'edited_at',
  'deleted_at',
  'expires_at',
  'created_at',
  'sent_via',
  'sealed',
  'pinned_at',
  'pinned_by',
] as const satisfies ReadonlyArray<Exclude<keyof MessagesTable, 'search'>>;
export type Message = Selectable<Omit<MessagesTable, 'search'>>;
export type Space = Selectable<SpacesTable>;
export type SpaceMember = Selectable<SpaceMembersTable>;
export type Organization = Selectable<OrganizationsTable>;
export type OrgUpdate = Selectable<OrgUpdatesTable>;
export type OrgMember = Selectable<OrgMembersTable>;
export type BusinessThread = Selectable<BusinessThreadsTable>;
export type OrgApp = Selectable<OrgAppsTable>;
export type Call = Selectable<CallsTable>;
export type Task = Selectable<TasksTable>;
export type Suggestion = Selectable<SuggestionsTable>;
