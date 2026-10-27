/**
 * Kysely table types for the SQL in ./migrations. Keep in step with the migrations: a column
 * added there is added here in the same commit.
 */
import type {
  AiUse,
  Audience,
  BookingHours,
  BookingItem,
  CatalogCollection,
  CustomerField,
  CustomKitDef,
  Gender,
  IntakeQuestion,
  OrderingSettings,
  OrgCallsFrom,
  PaymentSettings,
} from '@caime/core';
import type { AccountFailure } from '@caime/core/accounts';
import type { Surface } from '@caime/core/api';
import type {
  ColumnType,
  Generated,
  GeneratedAlways,
  Insertable,
  Selectable,
  Updateable,
} from 'kysely';

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
  /** When a provisional person (R75, R84, R97) became this account by proving the address. */
  claimed_at: NullableTimestamp;
  handle: string;
  /** What the handle reads as, for lookalikes (migration 0088, core `handleSkeleton`). */
  handle_skeleton: GeneratedAlways<string | null>;
  password_hash: string;
  display_name: string;
  kind: Defaulted<'human' | 'bot' | 'agent' | 'assistant' | 'character' | 'provisional'>;
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
  /** A line about what they do (M16 D4: from their default identity, which goes). */
  headline: string | null;
  pronouns: string | null;
  /** How they said Caime should refer to them (R81), or null: never guessed. */
  gender: Gender | null;
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
  /** What Cai learned, forgotten (R68): a suggestion kind, or '*', and since when. */
  learning_reset: JsonDefaulted<Record<string, string>>;
  onboarded_at: NullableTimestamp;
  /** When they said their recovery codes are saved (R56); null while the app still asks. */
  recovery_codes_seen_at: NullableTimestamp;
  /** The @handle link that brought them: a person's, or an organization's. */
  invited_by: string | null;
  invited_by_org: string | null;
  /** Suspended by the operator (R49): every way in closed until lifted; nothing removed. */
  suspended_at: NullableTimestamp;
  suspended_reason: string | null;
  /**
   * What a check of their age found (M16 B7): 18 or over or under, how, when, and until when an
   * under-18 outcome holds (`minorOf` reads that); null while never checked.
   */
  age_check: 'adult' | 'minor' | null;
  age_check_method: 'estimate' | 'document' | null;
  age_checked_at: NullableTimestamp;
  age_minor_until: NullableTimestamp;
  /** When a parent agreed to this day of birth (R122 (2)); any change of the day clears it. */
  birth_date_confirmed_at: NullableTimestamp;
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
  /** Where the app runs (R120, core `SURFACES`), said by it once a launch; null before. */
  surface: Surface | null;
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

/** A passkey (R36): a WebAuthn credential's public half, by the id its authenticator gave it. */
export interface PasskeysTable {
  id: string;
  user_id: string;
  public_key: Buffer;
  counter: ColumnType<string, string | number | undefined, string | number>;
  transports: Defaulted<string[]>;
  /** Synced by the person's password manager to their other devices (WebAuthn's BS flag). */
  backed_up: Defaulted<boolean>;
  name: string | null;
  created_at: Generated<Date>;
  last_used_at: NullableTimestamp;
}

/** A passkey ceremony's challenge, for one use within a few minutes. */
export interface PasskeyChallengesTable {
  id: string;
  user_id: string | null;
  purpose: 'register' | 'signin';
  challenge: string;
  expires_at: Date;
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
  /** R122: the guardian whose yes it waits for, while it involves a supervised child. */
  waits_on_guardian: Generated<string | null>;
}

/** R122: a parent's link for one child to sign up through (kept as its hash). */
export interface FamilyLinksTable {
  id: string;
  guardian_id: string;
  token_hash: Buffer;
  child_name: string;
  created_at: Generated<Date>;
  expires_at: Date;
  revoked_at: NullableTimestamp;
  spent_by: string | null;
  spent_at: NullableTimestamp;
}

/** R122: a child's guardian on Caime, and the consent they gave for the child's account. */
export interface GuardianshipsTable {
  id: string;
  child_id: string;
  /** Null once the parent's own account is gone; the consent stays the child's record. */
  guardian_id: string | null;
  link_id: string | null;
  asked_at: Date;
  consented_at: NullableTimestamp;
  consent_version: string | null;
  method: 'account' | 'account_age_checked' | null;
  ended_at: NullableTimestamp;
  ended_why: 'withdrawn' | 'not_mine' | 'lapsed' | 'guardian_gone' | 'operator' | null;
  /** How the wait began (R122 (2)): their parent's link, their own sign-up, or a correction. */
  began: Generated<'link' | 'sign_up' | 'corrected'>;
  /** Adults this account has asked, by handle or through its link: `ASKS_MAX` at most. */
  asks: Generated<number>;
  /** The link a waiting child sends a parent not on Caime yet, kept as its hash. */
  ask_token_hash: Buffer | null;
  ask_expires_at: NullableTimestamp;
  /** A looked-after child's correction, waiting for their parent's yes. */
  asked_born_on: string | null;
  asked_country: string | null;
  correction_asked_at: NullableTimestamp;
  /** The parent says yes to every new way in too (R122 (2), Moderate): never a message's words. */
  moderates: Generated<boolean>;
}

/**
 * What a parent who moderates says yes to before their child goes on (R122 (2), Moderate): an
 * invitation into a place, an ask to join one, a message request, an organization to write to.
 */
export interface GuardianAsksTable {
  id: string;
  guardian_id: string;
  child_id: string;
  kind: 'invite' | 'join' | 'request' | 'organization';
  place_invite_id: string | null;
  join_link_id: string | null;
  conversation_id: string | null;
  org_id: string | null;
  created_at: Date;
  answered_at: NullableTimestamp;
  answer: 'yes' | 'no' | null;
}

/** An adult who said a child's account isn't their child's (R122 (2)): never asked again by it. */
export interface FamilyRefusalsTable {
  child_id: string;
  guardian_id: string;
  refused_at: Date;
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

/** An organization's team invite (M16 C3a, migration 0094): a hashed token, a role, maybe an address. */
export interface OrgInvitesTable {
  id: string;
  org_id: string;
  token_hash: Buffer;
  role: Defaulted<'agent' | 'admin'>;
  email: string | null;
  created_by: string | null;
  uses: Defaulted<number>;
  expires_at: Date;
  revoked_at: NullableTimestamp;
  created_at: Generated<Date>;
}

/** A join link (M16 C3e): a group's or a space's, by its token's hash. */
export interface JoinLinksTable {
  id: string;
  conversation_id: string | null;
  space_id: string | null;
  token_hash: Buffer;
  created_by: string | null;
  uses: Defaulted<number>;
  expires_at: Date;
  revoked_at: NullableTimestamp;
  created_at: Generated<Date>;
  /** It asks (C3h): each person is let in by the place's owner or an admin (migration 0097). */
  approval: Defaulted<boolean>;
}

/** A link to someone's own file (M16 H6, migration 0128): its token kept as its hash alone. */
export interface FileLinksTable {
  id: string;
  file_id: string;
  message_id: string;
  created_by: string;
  token_hash: Buffer;
  audience: 'anyone' | 'caime';
  opens: Defaulted<number>;
  expires_at: Date;
  revoked_at: NullableTimestamp;
  created_at: Generated<Date>;
}

/** Someone's ask to join through a link that asks (M16 C3h), pending until it's decided. */
export interface JoinRequestsTable {
  id: string;
  link_id: string | null;
  conversation_id: string | null;
  space_id: string | null;
  user_id: string;
  created_at: Generated<Date>;
  decided_at: NullableTimestamp;
  decided_by: string | null;
  outcome: 'accepted' | 'declined' | 'withdrawn' | null;
}

/** An invitation to a group or a space, the invited person's to answer (M16 B4). */
export interface PlaceInvitesTable {
  id: string;
  conversation_id: string | null;
  space_id: string | null;
  user_id: string;
  invited_by: string | null;
  created_at: Generated<Date>;
  expires_at: Date;
  decided_at: NullableTimestamp;
  outcome: 'accepted' | 'declined' | null;
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
  /** Bulk or no-reply mail (R75): read here, never answered. */
  notice: Defaulted<boolean>;
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
  /**
   * Where they last wrote here (M16 D1): written by every path that inserts a message for its
   * sender, so the inbox's "asked since my last message" never looks for it among the messages.
   */
  last_sent_seq: BigIntCol;
  /** Marked unread by them (M16 E3b): a dot in Chats until they read it or say otherwise. */
  marked_unread_at: NullableTimestamp;
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
  /** A meeting's or an appointment's start (`fields.start.at`), kept apart so a window over
   * cards is an index read, never a scan of every payload (review 2026-10-09 M21). */
  card_start_at: Date | null;
  /**
   * When the `message.effects` sweep may step in for the fast path (review 2026-10-17 §4, A3):
   * set a grace ahead by the send, cleared once the effects are done, null where none are wanted.
   */
  effects_at: NullableTimestamp;
  /**
   * The words and what a card says of itself (title, reference, summary, booking), indexed (0065):
   * read by nothing since M17 I5, whose folded index (`messages_search_fold`, 0154) is an
   * expression over the row, and dropped in a later release.
   */
  search_all: ColumnType<string, never, never>;
  /** What sent it when its sender didn't type it in Caime: their token's name, or an app's. */
  sent_via: string | null;
  /** Came or went as mail (R75); `mail_messages` says more. */
  channel: 'mail' | null;
  /** In a private conversation (R18): the message as an envelope only its devices can open. */
  sealed: Json<Record<string, unknown>> | null;
  /** Kept at the conversation's top for everyone in it (PRD §22), and by whom. */
  pinned_at: NullableTimestamp;
  pinned_by: string | null;
  /**
   * The transaction that wrote it (M16 G5, migration 0138), as text: the order a person's feed
   * hands messages on in, up to the oldest transaction still running. Written by the database
   * alone; null for what came before the feed.
   */
  tx: ColumnType<string | null, never, never>;
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
  /** The rendition for what's drawn large (R70); the thumbnail's key when the image is small. */
  preview_key: string | null;
  status: Defaulted<'uploading' | 'ready' | 'failed'>;
  upload_offset: BigIntCol;
  created_at: Generated<Date>;
}

/**
 * What a link's page says of itself (M16 E4c), by the SHA-256 of the link's address (`id`; the
 * address itself isn't kept): read once by the server for a link sent in a conversation that
 * isn't private, kept for thirty days. `none` when the page said nothing worth a card. Its
 * picture is Caime's own small JPEG of it.
 */
export interface LinkPreviewsTable {
  id: string;
  status: 'ready' | 'none';
  title: string | null;
  description: string | null;
  site_name: string | null;
  image: Buffer | null;
  image_width: number | null;
  image_height: number | null;
  fetched_at: Timestamp;
}

/** A message as mail carried it (R75): its ids for threading, who it was between, how far one sent got. */
export interface MailMessagesTable {
  message_id: string;
  direction: 'in' | 'out';
  rfc_message_id: string;
  in_reply_to: string | null;
  references_ids: Defaulted<string[]>;
  from_address: string;
  to_address: string;
  subject: string | null;
  provider: string;
  provider_id: string | null;
  delivery: 'sent' | 'delivered' | 'bounced' | null;
  delivery_at: NullableTimestamp;
  delivery_detail: string | null;
  /** The HTML part of a mail in, as sent (R75 phase 2), shown only in a sandbox. */
  html: Defaulted<string | null>;
  /** A mail in's signature, cut from its words (core `mailText`). */
  signature: Defaulted<string | null>;
  /** A mail out the other side has seen: they replied, or opened it in Caime. */
  seen_at: NullableTimestamp;
  /** A mail out the provider saw opened (its pixel), only where `track_opens`: a "probably". */
  opened_at: NullableTimestamp;
  track_opens: Defaulted<boolean>;
  /** Mail in whose sender Caime couldn't confirm (M16 F1): kept as a notice that says so. */
  unverified: Defaulted<boolean>;
  created_at: Generated<Date>;
}
export type MailMessage = Selectable<MailMessagesTable>;

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

/**
 * A date's history (R119 level 2, M17 I19d): one move of a card's start or an action's due, kept
 * in the change's own transaction, never updated, gone with what it's about (migration 0161).
 */
export interface DateMovesTable {
  id: string;
  message_id: string | null;
  task_id: string | null;
  field: 'start' | 'due';
  value_at: NullableTimestamp;
  previous_at: NullableTimestamp;
  value_on: string | null;
  previous_on: string | null;
  /** `replan`, the plan truly moved; `correction`, a wrong value fixed. Slips count replans. */
  reason: 'replan' | 'correction';
  source: 'person' | 'rules';
  by_id: string | null;
  known_at: Generated<Date>;
}

/** A message written now and sent at `send_at` (M16 E8b); deleted once sent. */
export interface ScheduledMessagesTable {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string;
  body: string;
  reply_to_id: string | null;
  mentions: Generated<string[]>;
  send_at: Timestamp;
  /** Why it couldn't go, in the sender's language, once it couldn't. */
  failure: string | null;
  failed_at: NullableTimestamp;
  created_at: Generated<Date>;
}

/** A meeting's short address (M16 F6d): ten letters for a card held on Caime. */
export interface MeetingCodesTable {
  code: string;
  message_id: string;
  created_at: Generated<Date>;
}

/**
 * A reply Cai drafted (M17 I11b), held until the sweep sees what its person sent next there: keyed
 * hashes of its whole and its words, never the words (`lib/reply-drafts.ts`).
 */
export interface ReplyDraftsTable {
  user_id: string;
  conversation_id: string;
  after_seq: number;
  exact_hash: string;
  word_hashes: string[];
  drafted_at: Date;
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
  /**
   * The day it's due on when it has no time (R119, I19b): read on its owner's clock as `due_at` is
   * written (`dueOnSql`) and kept, so no reader's zone or a move of the owner's moves it.
   */
  due_on: string | null;
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
  /** Its owner handed it to Cai (R68): at its remind time Cai offers a follow-up to send. */
  cai_follow_up: Defaulted<boolean>;
  search: ColumnType<string, never, never>;
}

/** A person's calendar feed (PRD §72): the hash of the secret in its address. */
export interface CalendarFeedsTable {
  user_id: string;
  token_hash: Buffer;
  created_at: Generated<Date>;
  last_read_at: Date | null;
}

export interface ConnectedAccountsTable {
  id: string;
  user_id: string;
  provider: 'google' | 'microsoft';
  subject: string;
  email: string | null;
  uses: string[];
  scopes: string[];
  refresh_sealed: Buffer;
  /** The id of the key that sealed it (M16 B5, `vaultKid`), or null for the database's own. */
  refresh_kid: string | null;
  /** Its own standing: 'reconnect' once its grant is gone; 'failing' only as the release before wrote it. */
  state: 'connected' | 'reconnect' | 'failing';
  created_at: Generated<Date>;
  /** When its calendar was last read. */
  synced_at: Date | null;
  /** When its plans were last put in step with the person's cards (R96): written when that works. */
  pushed_at: Date | null;
  /** Why the busy read's and the push's last tries failed, and when; null once they work (0133). */
  read_failure: AccountFailure | null;
  read_failed_at: Date | null;
  push_failure: AccountFailure | null;
  push_failed_at: Date | null;
  /** Until when the provider asked Caime to wait (a 429's Retry-After): nothing is asked before. */
  rest_until: Date | null;
}

/** An event Caime wrote into a connected calendar for a card or a time of a series (R96). */
export interface CalendarPushesTable {
  account_id: string;
  user_id: string;
  /** The card's calendar id (`meetingUid`), the feed's too. */
  uid: string;
  /** The provider's id for the event. */
  event_id: string;
  start_at: Date;
  end_at: Date;
  /** Whether it shows busy there (a timed one); an all-day one is written free. */
  holds: boolean;
  /** What was written, hashed: written again only when it changes. */
  fingerprint: string;
  pushed_at: Generated<Date>;
}

/** A plan the provider refused on its own, kept until it's written or gone (M16 G4, 0137). */
export interface CalendarPushFailuresTable {
  account_id: string;
  uid: string;
  /** The plan as it was refused (`calendar_pushes`' fingerprint), or 'remove'. */
  fingerprint: string;
  status: number;
  attempts: Defaulted<number>;
  failed_at: Date;
}

/** An email or phone number someone added as theirs (R91), proven once `verified_at` is set. */
export interface OwnAddressesTable {
  id: string;
  user_id: string;
  kind: 'email' | 'phone';
  value: string;
  method: 'email' | 'whatsapp' | 'sms' | null;
  verified_at: Date | null;
  code_hash: Buffer | null;
  code_attempts: Defaulted<number>;
  code_expires_at: Date | null;
  created_at: Generated<Date>;
}

/** A place (R92): a person's or an organization's, one of the two owners set. */
export interface PlacesTable {
  id: string;
  user_id: string | null;
  org_id: string | null;
  kind: 'home' | 'work' | 'hq' | 'branch' | 'other';
  label: string | null;
  country: string;
  city: string | null;
  area: string | null;
  street: string | null;
  building: string | null;
  floor: string | null;
  unit: string | null;
  postal_code: string | null;
  directions: string | null;
  lat: number | null;
  lng: number | null;
  audience: Json<Audience | null>;
  org_audience: 'everyone' | 'customers' | 'team' | null;
  position: Defaulted<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ExternalBusyTable {
  account_id: string;
  user_id: string;
  start_at: Date;
  end_at: Date;
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
  /** Actioned or dismissed (M16 B3): its time to be kept counts from here. */
  closed_at: Generated<Date | null>;
  /** A visitor's report from a page (M16 B6): who, where to tell them, and the page. */
  visitor_name: Generated<string | null>;
  visitor_email: Generated<string | null>;
  page: Generated<string | null>;
}

/** A suspended account's appeal (M16 B6): one open at a time, decided by the operator. */
export interface AppealsTable {
  id: string;
  user_id: string;
  body: string;
  created_at: Generated<Date>;
  decided_at: NullableTimestamp;
  outcome: 'lifted' | 'upheld' | null;
  note: string | null;
}

/** A check of someone's age begun (M16 B7), with what the provider answered; never an image. */
export interface AgeChecksTable {
  id: string;
  user_id: string;
  provider: string;
  back: 'web' | 'app';
  trigger: string | null;
  created_at: Generated<Date>;
  finished_at: NullableTimestamp;
  outcome: 'adult' | 'minor' | 'failed' | null;
  method: 'estimate' | 'document' | null;
  confidence: string | null;
  error: string | null;
}

/** What a report held as its reporter saw it (M16 B3), gone with the report. */
export interface ReportEvidenceTable {
  report_id: string;
  position: number;
  message_id: string | null;
  sender_id: string | null;
  sender_name: string | null;
  kind: string;
  body: string | null;
  sent_at: Date;
  reported: Defaulted<boolean>;
  imported: Defaulted<boolean>;
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
  /** Out of attempts (review 2026-10-17): listed to the operator, retried by hand. */
  dead_at: NullableTimestamp;
  dedupe_key: string | null;
  created_at: Generated<Date>;
}

/** A periodic task's one run per interval across every instance (`claimPeriodic`). */
export interface PeriodicRunsTable {
  name: string;
  started_at: Date;
  finished_at: Date | null;
  instance: string;
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
  /** The chain (R78, migration 0072): its place, the hash before it and its own, written as the row's transaction commits. */
  seq: Generated<string | null>;
  prev_hash: Generated<string | null>;
  hash: Generated<string | null>;
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
  /** A transcript's recording length, for a provider that bills by the minute (0129). */
  audio_ms: number | null;
  latency_ms: number | null;
  outcome: string;
  /** The conversation the AI agent was answering in, for its per-conversation bound. */
  conversation_id: string | null;
  /** Its answer was thrown away, never sent: the call counts, the answer doesn't. */
  discarded_at: NullableTimestamp;
  /** Which version of the feature's instructions answered it (M16 G6a, 0140). */
  prompt_hash: string | null;
  /**
   * What it cost when it ran, in US dollars, as an allowance counts it (`chargedUsd`, M16 G9,
   * 0142); null for a call that never got an answer's usage, and for calls before it.
   */
  cost_usd: number | null;
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
  /** What the handle reads as, for lookalikes (migration 0088, core `handleSkeleton`). */
  handle_skeleton: GeneratedAlways<string | null>;
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
  /** Where it's based (ISO 3166-1), for its defaults (core countries.ts). */
  country: string | null;
  /** Its own time zone and days worked (R76), or null for its country's. */
  time_zone: string | null;
  workweek: number[] | null;
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
  /** Closed: whoever owned it last, to whom its export stays open for a while (DPA §12). */
  last_owner_id: Generated<string | null>;
  /** Closed, and what was its alone deleted (DPA §12): when. */
  cleared_at: NullableTimestamp;
  /** Anyone with a proven address at its verified domain may join its team (M16 C3b). */
  domain_join: Generated<boolean>;
  /** Its members' own tokens and apps reach its conversations (M16 G3; off by default). */
  member_apps: Generated<boolean>;
  /** Suspended by the operator (M16 B3): since when, and why, said to its team. */
  suspended_at: Generated<Date | null>;
  suspended_reason: Generated<string | null>;
  /** What its automatic replies say (M16 H2): a customer's first message, and while it's closed. */
  greeting: Generated<string | null>;
  away_message: Generated<string | null>;
  /** The account its automatic replies come from: a bot named as it, never on its team. */
  replies_bot_id: Generated<string | null>;
  /** The fields its team keeps for each customer (M16 H3), in its order. */
  customer_fields: JsonDefaulted<CustomerField[]>;
  /** Who may call it (M16 H8a): nobody until its owner or an admin says its customers may. */
  calls_from: Generated<OrgCallsFrom>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** What an organization's team keeps about one of its customers (M16 H3), for the team alone. */
export interface OrgCustomersTable {
  org_id: string;
  customer_id: string;
  note: string | null;
  tags: Defaulted<string[]>;
  /** Its fields' values, by the field's id. */
  fields: JsonDefaulted<Record<string, string>>;
  updated_by: string | null;
  updated_at: Generated<Date>;
}

/** A reply an organization's team keeps for what customers ask often (M16 H2). */
export interface OrgQuickRepliesTable {
  id: string;
  org_id: string;
  shortcut: string;
  body: string;
  position: Defaulted<number>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** An organization's intake form (M16 H5): its questions, as a Form card copies them. */
export interface OrgFormsTable {
  id: string;
  org_id: string;
  name: string;
  intro: string | null;
  questions: JsonDefaulted<IntakeQuestion[]>;
  position: Defaulted<number>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrgReclaimsTable {
  org_id: string;
  user_id: string;
  token: string;
  created_at: Date;
}

export interface OrgMembersTable {
  org_id: string;
  user_id: string;
  role: Defaulted<OrgRole>;
  title: string | null;
  added_by: string | null;
  joined_at: Generated<Date>;
  left_at: NullableTimestamp;
  /** Taken off the team by its owner or an admin (M16 C3b): never back by their address alone. */
  removed_at: NullableTimestamp;
}

export interface BusinessThreadsTable {
  conversation_id: string;
  org_id: string;
  customer_id: string | null;
  /** The organization the customer writes for (R64), or none. */
  customer_org_id: string | null;
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
  /**
   * A customer's call to an organization (M16 H8a): it rings the team in `call_team_rings`, and
   * whoever answers becomes its callee; the customer sees the organization, never them (R15).
   */
  org_id: Generated<string | null>;
  /**
   * The meeting or appointment it is (M16 F6e): the card held here whose Join was open in its
   * conversation when it was placed (`meetingNow`), else none.
   */
  card_id: Generated<string | null>;
}

/** Who on an organization's team a customer's call rang (M16 H8a), and who turned it down. */
export interface CallTeamRingsTable {
  call_id: string;
  user_id: string;
  declined_at: NullableTimestamp;
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

/** Cai taking notes in a call (M16 F7, R82 under R85): asked, on, and how it stopped. */
export interface CallNotesTable {
  id: string;
  call_id: string;
  conversation_id: string;
  /** Who asked, whose day's allowance pays for hearing it (R107). */
  started_by: string | null;
  /** 'switching': another mode asked while one is on (M17 I13b2), beside the live row. */
  state: 'asking' | 'on' | 'stopped' | 'declined' | 'switching';
  /** Asked beside a live row (M17 I13b2): never read as the notes unless it took over. */
  switch: Generated<boolean>;
  /** The browser recording while it's on: a member's, never a guest's (R85 (4)). */
  recorder_id: string | null;
  recorder_device: string | null;
  /** The call's line in its conversation, once the call has ended: the notes go with it. */
  message_id: string | null;
  asked_at: Generated<Date>;
  started_at: NullableTimestamp;
  stopped_at: NullableTimestamp;
  stopped_by: string | null;
  why:
    | 'stopped'
    | 'declined'
    | 'joined_without'
    | 'minor'
    | 'ended'
    | 'no_recorder'
    | 'allowance'
    | 'replaced'
    | null;
  /** The Record mode (R114): what's said and shown kept as a recording, beside the notes. */
  records: Generated<boolean>;
  /** The Interact mode (R114 (3), M17 I13g): Cai, called by name, answers aloud in the call. */
  interacts: Generated<boolean>;
  /** When Cai introduced itself aloud as it joined (R87), once a row. */
  introduced_at: NullableTimestamp;
  /** Until when the recording is kept: thirty days, or an organization's shorter retention. */
  recording_until: NullableTimestamp;
  /** Deleted for everyone by someone in it: the notes stay (R52). */
  recording_deleted_at: NullableTimestamp;
  /** Kept past its day by whoever asked (M17 I13d), its bytes against their storage. */
  kept_by: string | null;
  kept_at: NullableTimestamp;
  created_at: Generated<Date>;
}

/** Each person's yes or no to a call's notes, on the device they said it on. */
export interface CallNoteAnswersTable {
  notes_id: string;
  user_id: string;
  answer: 'yes' | 'no';
  device: string | null;
  can_record: Generated<boolean>;
  at: Generated<Date>;
}

/** One utterance of a call's notes: its words once heard, its audio only until then (R85 (5)). */
/**
 * What Cai said in a call it joined (R114 (3), M17 I13g): the words, their sound for the
 * recorder's browser (kept an hour), and when, the window a microphone's echo is dropped in.
 */
export interface CallCaiUtterancesTable {
  id: string;
  call_id: string;
  notes_id: string;
  text: string;
  storage_key: string | null;
  mime: Generated<string>;
  spoken_from: Date;
  spoken_until: Date;
  created_at: Generated<Date>;
}

export interface CallNoteLinesTable {
  id: string;
  notes_id: string;
  speaker_id: string;
  spoken_at: Date;
  length_ms: number;
  file_id: string | null;
  body: string | null;
  language: string | null;
  state: Generated<'waiting' | 'heard' | 'unheard'>;
  /** Cai answered this line's call to it (M17 I13h): claimed by the first job to answer, once. */
  cai_answered_at: NullableTimestamp;
  created_at: Generated<Date>;
}

/**
 * A part of a call's recording (R114, M17 I13b): the voices of everyone who said yes, mixed, or
 * one screen as it was shown, sent in pieces by the recording browser and made seekable once it
 * ends; read by whoever was in the call when it began.
 */
export interface CallRecordingPartsTable {
  id: string;
  notes_id: string;
  call_id: string;
  kind: 'voices' | 'screen';
  shown_by: string | null;
  recorder_id: string | null;
  recorder_device: string;
  storage_key: string;
  mime: string;
  bytes: BigIntCol;
  started_at: Date;
  ended_at: NullableTimestamp;
  duration_ms: number | null;
  state: Generated<'recording' | 'finishing' | 'ready' | 'failed' | 'deleted'>;
  last_piece_at: NullableTimestamp;
  created_at: Generated<Date>;
}

/**
 * A frame of a shown screen kept with the recording (R114 (1) and (4), M17 I13h): one at each
 * change of the screen, at its moment into its part, and what Cai read of it for the write-up.
 */
export interface CallRecordingFramesTable {
  id: string;
  part_id: string;
  notes_id: string;
  call_id: string;
  /** Milliseconds into its part. */
  at_ms: number;
  storage_key: string;
  bytes: Generated<number>;
  width: number;
  height: number;
  /** What the screen showed, as Cai read it for the write-up; null until then. */
  read: string | null;
  created_at: Generated<Date>;
}

/**
 * A call's recording shared into a conversation (R114 (7), M17 I13e): the share is a message of
 * the sharer's that points at the call; this row finds every share of a call when its recording
 * goes, so nothing reads messages' payload for it.
 */
/**
 * Cai's answers said aloud in its chat (M17 I14a): the sound's file, the message it was said in
 * (null once that's gone) and when, for the sweep that lets the sound go.
 */
export interface CaiSpokenTable {
  file_id: string;
  message_id: string | null;
  created_at: Generated<Date>;
}

export interface CallRecordingSharesTable {
  message_id: string;
  call_id: string;
  shared_by: string | null;
  created_at: Generated<Date>;
}

/**
 * Cai's notes of a call, written once it's over (M16 F7e, R112): one row a call, for whoever was
 * in it for all of it; gone with the call's line.
 */
/** Cai answering for someone in a one-to-one (R116, M17 I16a, ADR-18): one row a conversation. */
export interface CaiAnsweringTable {
  id: string;
  conversation_id: string;
  receiver_id: string;
  caller_id: string;
  state: 'offered' | 'left' | 'talking' | 'ended';
  talk: Generated<boolean>;
  payer_id: string | null;
  turns: Generated<number>;
  from_seq: ColumnType<string, string | number, string | number>;
  offered_at: Generated<Date>;
  ended_at: NullableTimestamp;
  ended_by: 'caller' | 'receiver' | 'declined' | 'limit' | 'handed_over' | null;
  summary_message_id: string | null;
  /** Why Cai answered (M17 I16a2): a stranger's request, a wait unanswered, the receiver busy. */
  reason: Generated<'request' | 'unanswered' | 'busy'>;
  /** The receiver covers the talk from their own allowance. */
  covered: Generated<boolean>;
  /** When Cai let the receiver know at once that it couldn't wait. */
  rang_at: NullableTimestamp;
}

export interface CallNoteSummariesTable {
  call_id: string;
  conversation_id: string;
  message_id: string | null;
  state: 'writing' | 'written' | 'none';
  summary: Json | null;
  written_at: NullableTimestamp;
  requested_at: Generated<Date>;
  created_at: Generated<Date>;
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

/**
 * The draft its AI agent left in a conversation for its team (M16 G6b, 0141): one at most, for
 * the customer's message `seq`; `draft` holds its answer alone, what it rests on and what it
 * would book or order (`AgentDraft` in lib/agent-drafts.ts).
 */
export interface AgentDraftsTable {
  conversation_id: string;
  org_id: string;
  seq: ColumnType<string, string | number, string | number>;
  action: 'answer' | 'resolve' | 'book' | 'order';
  body: string;
  draft: Json<unknown>;
  run_id: string | null;
  created_at: Generated<Date>;
}

/** A customer's message its AI agent couldn't answer from what it was told (M16 G6b, 0141). */
export interface AgentQuestionsTable {
  id: string;
  org_id: string;
  conversation_id: string;
  message_id: string;
  created_at: Generated<Date>;
  done_at: NullableTimestamp;
  done_by: string | null;
}

/** An organization's AI agent (PRD §74–75): one per organization, answering as its own user. */
export interface OrgAgentsTable {
  org_id: string;
  bot_user_id: string;
  knowledge: string;
  paused_at: NullableTimestamp;
  /** What it may do beyond answering (M16 G6a, 0140): offer and book times, take orders. */
  may_book: Defaulted<boolean>;
  may_order: Defaulted<boolean>;
  /** Always, or only while the organization is closed by its hours. */
  answers_when: Defaulted<'always' | 'closed'>;
  /** Its team checks each answer before it's sent (M16 G6b, 0141). */
  review: Defaulted<boolean>;
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
  /** Until when the secret before the last replacement still signs deliveries (0052). */
  previous_secret_until: NullableTimestamp;
  /**
   * The signing secret and the one before it, sealed through the vault, each with the id of the
   * key that sealed it (0130, `lib/app-secrets.ts`). Nothing is kept in clear: the copies the
   * releases before kept were emptied by 0134 and their columns dropped by 0136.
   */
  webhook_secret_sealed: Buffer | null;
  webhook_secret_kid: string | null;
  previous_secret_sealed: Buffer | null;
  previous_secret_kid: string | null;
  events: Defaulted<string[]>;
  created_by: string | null;
  created_at: Generated<Date>;
  revoked_at: NullableTimestamp;
}

/** A sealed ticket's nonce, spent at its first opening and kept until it expires (0131). */
export interface SpentTicketsTable {
  id: string;
  expires_at: Date;
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

/**
 * How many of an item sold by the piece its host has left (R60): an organization's or a
 * person's, one of the two; `host_id` is whichever it is. No row, not counted.
 */
export interface ItemStockTable {
  org_id: string | null;
  user_id: string | null;
  host_id: ColumnType<string, never, never>;
  item_id: string;
  remaining: number;
  updated_at: Generated<Date>;
}

/** What an open order took of its host's stock (R60), until it's on its way or given back. */
export interface OrderStockTable {
  message_id: string;
  host_id: string;
  item_id: string;
  quantity: number;
}

/** An organization's own payment provider account (R65). */
export interface OrgCheckoutTable {
  org_id: string;
  provider: Generated<string>;
  account_id: string;
  livemode: boolean;
  charges_enabled: Generated<boolean>;
  connected_by: string | null;
  connected_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A connection under way: whose, for which organization, until when. */
export interface CheckoutStatesTable {
  token: string;
  org_id: string;
  user_id: string;
  expires_at: Date;
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
  /** Made for an automation platform (R79): the bridge's id, listed as the platform. */
  bridge: string | null;
}

export interface OAuthClientsTable {
  id: string;
  client_id: string;
  owner_id: string;
  name: string;
  website: string | null;
  redirect_uris: string[];
  secret_hash: Buffer | null;
  /** The secret before the last replacement, still taken until `…_until` (0132, M16 G1). */
  previous_secret_hash: Generated<Buffer | null>;
  previous_secret_until: Generated<Date | null>;
  created_at: Generated<Date>;
  revoked_at: NullableTimestamp;
  /** Its listing in Discover (R74). */
  tagline: Generated<string | null>;
  description: Generated<string | null>;
  category: Generated<string | null>;
  icon_file_id: Generated<string | null>;
  org_id: Generated<string | null>;
  login_url: Generated<string | null>;
  listed_at: Generated<Date | null>;
  reviewed_at: Generated<Date | null>;
  declined_reason: Generated<string | null>;
  connected_count: Generated<number>;
  /** Counted up on each change to what Discover shows (R74). */
  listing_rev: Generated<number>;
  /** What it gives Caime (R78): `APP_PROVIDES` entries. */
  provides: Generated<string[]>;
  /** The marketplace (R80, migration 0073): its address, held once given, and what it says. */
  slug: Generated<string | null>;
  pricing: Generated<string | null>;
  languages: Generated<string[]>;
  support_url: Generated<string | null>;
  privacy_url: Generated<string | null>;
  ai_use: ColumnType<AiUse | null, AiUse | string | null | undefined, AiUse | string | null>;
  screenshot_ids: Generated<string[]>;
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

/**
 * A meeting's own space (R84): the card it was agreed on, its group, and the card's copy there
 * (null for the moment between the space's claim and its copy, sent with `copy_client_id`).
 */
export interface MeetingSpacesTable {
  message_id: string;
  conversation_id: string;
  space_message_id: string | null;
  copy_client_id: string;
  created_by: string | null;
  created_at: Generated<Date>;
}

/** A guest invited to a meeting by address (R84), and their link's hash. */
export interface MeetingGuestsTable {
  id: string;
  space_message_id: string;
  user_id: string;
  invited_by: string | null;
  token_hash: Buffer;
  created_at: Generated<Date>;
  revoked_at: NullableTimestamp;
  joined_at: NullableTimestamp;
  adult: boolean | null;
  answer: 'accepted' | 'declined' | 'tentative' | null;
  answered_at: NullableTimestamp;
}

export interface Database {
  meeting_spaces: MeetingSpacesTable;
  meeting_guests: MeetingGuestsTable;
  users: UsersTable;
  identities: IdentitiesTable;
  sessions: SessionsTable;
  recovery_codes: RecoveryCodesTable;
  passkeys: PasskeysTable;
  passkey_challenges: PasskeyChallengesTable;
  email_codes: EmailCodesTable;
  password_resets: PasswordResetsTable;
  connections: ConnectionsTable;
  connection_sides: ConnectionSidesTable;
  connection_requests: ConnectionRequestsTable;
  family_links: FamilyLinksTable;
  guardianships: GuardianshipsTable;
  family_refusals: FamilyRefusalsTable;
  guardian_asks: GuardianAsksTable;
  invites: InvitesTable;
  org_invites: OrgInvitesTable;
  join_links: JoinLinksTable;
  file_links: FileLinksTable;
  join_requests: JoinRequestsTable;
  place_invites: PlaceInvitesTable;
  appeals: AppealsTable;
  age_checks: AgeChecksTable;
  custom_roles: CustomRolesTable;
  relationships: RelationshipsTable;
  relationship_events: RelationshipEventsTable;
  relationship_policies: RelationshipPoliciesTable;
  suggestions: SuggestionsTable;
  contexts: ContextsTable;
  conversations: ConversationsTable;
  participants: ParticipantsTable;
  messages: MessagesTable;
  link_previews: LinkPreviewsTable;
  reactions: ReactionsTable;
  files: FilesTable;
  message_files: MessageFilesTable;
  mail_messages: MailMessagesTable;
  assets: AssetsTable;
  automations: AutomationsTable;
  saved_items: SavedItemsTable;
  released_handles: ReleasedHandlesTable;
  tasks: TasksTable;
  date_moves: DateMovesTable;
  scheduled_messages: ScheduledMessagesTable;
  meeting_codes: MeetingCodesTable;
  reply_drafts: ReplyDraftsTable;
  calendar_feeds: CalendarFeedsTable;
  connected_accounts: ConnectedAccountsTable;
  own_addresses: OwnAddressesTable;
  places: PlacesTable;
  external_busy: ExternalBusyTable;
  calendar_pushes: CalendarPushesTable;
  calendar_push_failures: CalendarPushFailuresTable;
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
  report_evidence: ReportEvidenceTable;
  domain_events: DomainEventsTable;
  jobs: JobsTable;
  periodic_runs: PeriodicRunsTable;
  audit_log: AuditLogTable;
  ai_runs: AiRunsTable;
  server_settings: ServerSettingsTable;
  poll_votes: PollVotesTable;
  hidden_messages: HiddenMessagesTable;
  spaces: SpacesTable;
  space_members: SpaceMembersTable;
  organizations: OrganizationsTable;
  org_quick_replies: OrgQuickRepliesTable;
  org_forms: OrgFormsTable;
  org_customers: OrgCustomersTable;
  org_checkout: OrgCheckoutTable;
  item_stock: ItemStockTable;
  order_stock: OrderStockTable;
  checkout_states: CheckoutStatesTable;
  org_members: OrgMembersTable;
  org_reclaims: OrgReclaimsTable;
  business_threads: BusinessThreadsTable;
  org_apps: OrgAppsTable;
  spent_tickets: SpentTicketsTable;
  app_kits: AppKitsTable;
  org_agents: OrgAgentsTable;
  agent_drafts: AgentDraftsTable;
  agent_questions: AgentQuestionsTable;
  calls: CallsTable;
  call_team_rings: CallTeamRingsTable;
  call_members: CallMembersTable;
  call_notes: CallNotesTable;
  call_note_answers: CallNoteAnswersTable;
  call_note_lines: CallNoteLinesTable;
  call_cai_utterances: CallCaiUtterancesTable;
  call_recording_parts: CallRecordingPartsTable;
  call_recording_frames: CallRecordingFramesTable;
  call_recording_shares: CallRecordingSharesTable;
  cai_spoken: CaiSpokenTable;
  call_note_summaries: CallNoteSummariesTable;
  cai_answering: CaiAnsweringTable;
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
 * Every column of a message but `search_all`, the tsvector search read until M17 I5, and `tx`,
 * the transaction only the feed orders by (M16 G5): a message is selected with these
 * (`.select(MESSAGE_COLUMNS)`), never `selectAll()`, which shipped the vector with every row read
 * (`messaging.test.ts` holds this list to the table).
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
  'channel',
  'sealed',
  'pinned_at',
  'pinned_by',
  'card_start_at',
  'effects_at',
] as const satisfies ReadonlyArray<Exclude<keyof MessagesTable, 'search_all' | 'tx'>>;
export type Message = Selectable<Omit<MessagesTable, 'search_all' | 'tx'>>;
export type Space = Selectable<SpacesTable>;
export type SpaceMember = Selectable<SpaceMembersTable>;
export type Organization = Selectable<OrganizationsTable>;
export type OrgUpdate = Selectable<OrgUpdatesTable>;
export type OrgMember = Selectable<OrgMembersTable>;
export type BusinessThread = Selectable<BusinessThreadsTable>;
export type OrgApp = Selectable<OrgAppsTable>;
export type Call = Selectable<CallsTable>;
export type CallNotes = Selectable<CallNotesTable>;
export type Task = Selectable<TasksTable>;
export type Suggestion = Selectable<SuggestionsTable>;

/**
 * A host's catalog (R58–R62): the hours, items, ordering, collections and ways to be paid, five
 * jsonb columns that only the booking path, the public pages, a person's export and the
 * organization's own view read. Every other read of a person or an organization selects
 * `USER_COLUMNS` or `ORG_COLUMNS` (review 2026-10-09 M19: a presence change, a message's
 * sender, every person in a view carried the catalogs with them); `columns.test.ts` holds the
 * lists to the tables and the source to the rule.
 */
export const CATALOG_COLUMNS = [
  'booking',
  'booking_items',
  'ordering',
  'collections',
  'payments',
] as const satisfies ReadonlyArray<keyof UsersTable & keyof OrganizationsTable>;
export const USER_COLUMNS = [
  'id',
  'email',
  'email_verified_at',
  'claimed_at',
  'handle_skeleton',
  'handle',
  'password_hash',
  'display_name',
  'kind',
  'birth_date',
  'locale',
  'time_zone',
  'country',
  'workweek',
  'quiet_hours',
  'plan',
  'plan_source',
  'avatar_file_id',
  'bio',
  'headline',
  'pronouns',
  'gender',
  'status_text',
  'status_emoji',
  'presence',
  'last_active_at',
  'privacy',
  'preferences',
  'ai_enabled',
  'learning_reset',
  'onboarded_at',
  'recovery_codes_seen_at',
  'invited_by',
  'invited_by_org',
  'suspended_at',
  'suspended_reason',
  'age_check',
  'age_check_method',
  'age_checked_at',
  'age_minor_until',
  'birth_date_confirmed_at',
  'created_at',
  'updated_at',
  'deleted_at',
] as const satisfies ReadonlyArray<Exclude<keyof UsersTable, (typeof CATALOG_COLUMNS)[number]>>;
export const ORG_COLUMNS = [
  'id',
  'name',
  'handle',
  'handle_skeleton',
  'kind',
  'about',
  'website',
  'domain',
  'verify_token',
  'verified_at',
  'created_by',
  'archived_at',
  'plan',
  'plan_source',
  'country',
  'time_zone',
  'workweek',
  'founded_year',
  'avatar_file_id',
  'retention_days',
  'reclaim_by',
  'reclaim_token',
  'succeeded_by',
  'last_owner_id',
  'cleared_at',
  'domain_join',
  'member_apps',
  'suspended_at',
  'suspended_reason',
  'greeting',
  'away_message',
  'replies_bot_id',
  'customer_fields',
  'calls_from',
  'created_at',
  'updated_at',
] as const satisfies ReadonlyArray<
  Exclude<keyof OrganizationsTable, (typeof CATALOG_COLUMNS)[number]>
>;
/** A person or an organization as the app reads them: everything but the catalog. */
export type UserRow = Pick<Selectable<UsersTable>, (typeof USER_COLUMNS)[number]>;
export type OrgRow = Pick<Selectable<OrganizationsTable>, (typeof ORG_COLUMNS)[number]>;

/**
 * A column list under a query's alias (`columnsOf('u', USER_COLUMNS)` is `u.id`, `u.email`…), for
 * a join: `selectAll('u')` would carry what the list leaves out (M16 D1, `select-all.test.ts`).
 */
export function columnsOf<A extends string, C extends string>(
  alias: A,
  columns: readonly C[],
): Array<`${A}.${C}`> {
  return columns.map((c) => `${alias}.${c}` as `${A}.${C}`);
}
