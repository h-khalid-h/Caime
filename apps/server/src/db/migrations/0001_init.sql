-- Caishy initial schema. Connection is the primary domain object (PRD §4); see
-- docs/ARCHITECTURE.md "Domain model". Append-only once deployed: never edit, add a new file.

create extension if not exists pg_trgm;
create extension if not exists citext;

-- ------------------------------------------------------------------------------------------
-- Identity (PRD §35)

create table users (
  id uuid primary key,
  email citext not null unique,
  email_verified_at timestamptz,
  handle citext not null unique,
  password_hash text not null,
  display_name text not null,
  kind text not null default 'human' check (kind in ('human', 'bot', 'agent')),
  birth_year int,
  locale text not null default 'en',
  time_zone text not null default 'UTC',
  region text,
  workweek smallint[] not null default '{1,2,3,4,5}',
  quiet_hours jsonb,
  plan text not null default 'personal' check (plan in ('personal', 'pro', 'business', 'enterprise')),
  avatar_file_id uuid,
  bio text,
  pronouns text,
  status_text text,
  status_emoji text,
  presence text not null default 'auto' check (presence in ('auto', 'available', 'busy', 'away', 'invisible')),
  last_active_at timestamptz,
  privacy jsonb not null,
  preferences jsonb not null default '{}',
  ai_enabled boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index users_display_name_trgm on users using gin (display_name gin_trgm_ops);
create index users_handle_trgm on users using gin ((handle::text) gin_trgm_ops);

create table identities (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('personal', 'professional', 'organization')),
  display_name text not null,
  headline text,
  org_id uuid,
  org_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index identities_user on identities (user_id);
create unique index identities_one_default on identities (user_id) where is_default;

create table sessions (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  token_hash bytea not null unique,
  kind text not null check (kind in ('web', 'native', 'api')),
  device_name text,
  platform text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index sessions_user on sessions (user_id) where revoked_at is null;

create table recovery_codes (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  code_hash bytea not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index recovery_codes_user on recovery_codes (user_id) where used_at is null;

-- ------------------------------------------------------------------------------------------
-- Connections and relationships (PRD §5, §10–§14, §50–§53)

create table connections (
  id uuid primary key,
  user_a uuid not null references users (id) on delete cascade,
  user_b uuid not null references users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);

-- One row per participant: how *this* side sees and treats the connection.
create table connection_sides (
  connection_id uuid not null references connections (id) on delete cascade,
  owner_id uuid not null references users (id) on delete cascade,
  other_id uuid not null references users (id) on delete cascade,
  identity_id uuid references identities (id) on delete set null,
  nickname text,
  note text,
  attention text not null default 'auto' check (attention in ('auto', 'priority', 'normal', 'quiet')),
  muted_until timestamptz,
  archived_at timestamptz,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (connection_id, owner_id)
);
create unique index connection_sides_owner_other on connection_sides (owner_id, other_id);

create table connection_requests (
  id uuid primary key,
  from_user uuid not null references users (id) on delete cascade,
  to_user uuid not null references users (id) on delete cascade,
  note text,
  context_sphere text,
  context_org_name text,
  from_identity_id uuid references identities (id) on delete set null,
  -- The requester's own classification, applied when accepted. Never shown to the recipient.
  pending_relationship jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);
create unique index connection_requests_pending on connection_requests (from_user, to_user) where status = 'pending';
create index connection_requests_to on connection_requests (to_user, created_at desc) where status = 'pending';

create table custom_roles (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  sphere text not null,
  label text not null,
  created_at timestamptz not null default now(),
  unique (user_id, sphere, label)
);

-- Directional and owner-private (PRD §10, §62). Versioned: a change supersedes, never overwrites.
create table relationships (
  id uuid primary key,
  owner_id uuid not null references users (id) on delete cascade,
  subject_id uuid not null references users (id) on delete cascade,
  connection_id uuid references connections (id) on delete set null,
  sphere text not null,
  role text,
  role_label text,
  org_id uuid,
  org_name text,
  context_note text,
  status text not null default 'active' check (status in ('active', 'ended', 'archived', 'superseded', 'merged')),
  is_primary boolean not null default true,
  shared boolean not null default false,
  source text not null default 'user' check (source in ('user', 'suggestion', 'invite', 'template', 'import')),
  superseded_by uuid references relationships (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (owner_id <> subject_id)
);
create index relationships_owner_subject on relationships (owner_id, subject_id);
create index relationships_owner_active on relationships (owner_id, sphere, role) where status = 'active';
create index relationships_subject_shared on relationships (subject_id, owner_id) where shared and status = 'active';

create table relationship_events (
  id uuid primary key,
  relationship_id uuid not null references relationships (id) on delete cascade,
  owner_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('created', 'changed', 'ended', 'archived', 'restored', 'merged', 'shared', 'unshared')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index relationship_events_relationship on relationship_events (relationship_id, at);
create index relationship_events_owner on relationship_events (owner_id, at desc);

create table relationship_policies (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  name text,
  scope_sphere text,
  scope_role text,
  scope_org_id uuid,
  scope_connection_id uuid references connections (id) on delete cascade,
  settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index relationship_policies_user on relationship_policies (user_id);

-- Inferences awaiting a decision (PRODUCT-REVIEW R12). The fingerprint keeps a dismissed
-- suggestion from coming back.
create table suggestions (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  title text not null,
  rationale text not null,
  confidence real not null,
  payload jsonb not null default '{}',
  conversation_id uuid,
  message_id uuid,
  subject_user_id uuid references users (id) on delete cascade,
  due_at timestamptz,
  due_text text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed', 'expired')),
  result_ref jsonb,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, fingerprint)
);
create index suggestions_pending on suggestions (user_id, created_at desc) where status = 'pending';
create index suggestions_conversation on suggestions (conversation_id) where status = 'pending';
create index suggestions_message on suggestions (message_id);

-- ------------------------------------------------------------------------------------------
-- Context (PRD §17, §27)

create table contexts (
  id uuid primary key,
  created_by uuid references users (id) on delete set null,
  kind text not null check (kind in ('project', 'order', 'trip', 'appointment', 'school', 'event', 'contract', 'issue', 'family', 'other')),
  title text not null,
  purpose text,
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  deadline_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------------------
-- Conversations and messages (PRD §15–§22, §80)

create table conversations (
  id uuid primary key,
  kind text not null check (kind in ('direct', 'group', 'business', 'community', 'broadcast')),
  title text,
  purpose text,
  avatar_file_id uuid,
  -- Direct conversations: the sorted pair "low:high", whether or not a connection exists yet.
  direct_key text,
  connection_id uuid references connections (id) on delete set null,
  is_general boolean not null default false,
  parent_id uuid references conversations (id) on delete set null,
  context_id uuid references contexts (id) on delete set null,
  space_id uuid,
  org_id uuid,
  privacy_class text not null default 'standard' check (privacy_class in ('standard', 'private')),
  temporary_until timestamptz,
  retention_days int check (retention_days is null or retention_days > 0),
  created_by uuid references users (id) on delete set null,
  last_seq bigint not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'direct' or direct_key is not null)
);
create unique index conversations_general_direct on conversations (direct_key) where is_general;
create index conversations_direct_key on conversations (direct_key) where direct_key is not null;
create index conversations_parent on conversations (parent_id) where parent_id is not null;
create index conversations_context on conversations (context_id) where context_id is not null;

create table participants (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'guest', 'agent')),
  identity_id uuid references identities (id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_seq bigint not null default 0,
  last_delivered_seq bigint not null default 0,
  attention text not null default 'auto' check (attention in ('auto', 'priority', 'normal', 'quiet')),
  muted_until timestamptz,
  archived_at timestamptz,
  pinned_at timestamptz,
  -- Message requests from non-connections (R14): the recipient's decision.
  request_state text check (request_state in ('pending', 'accepted', 'declined')),
  -- "Doesn't need me": questions up to this seq don't count toward Needs you (R8).
  dismissed_seq bigint not null default 0,
  draft text,
  draft_updated_at timestamptz,
  primary key (conversation_id, user_id)
);
create index participants_user on participants (user_id) where left_at is null;

create table messages (
  id uuid primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  seq bigint not null,
  sender_id uuid references users (id) on delete set null,
  client_id text,
  kind text not null check (kind in ('text', 'media', 'file', 'voice', 'location', 'contact', 'poll', 'kit', 'sticker', 'system')),
  body text,
  payload jsonb not null default '{}',
  mode text not null default 'talk',
  mode_source text not null default 'auto' check (mode_source in ('auto', 'user')),
  entities jsonb not null default '{}',
  mentions uuid[] not null default '{}',
  reply_to_id uuid references messages (id) on delete set null,
  forwarded_from_id uuid references messages (id) on delete set null,
  urgent boolean not null default false,
  is_question boolean not null default false,
  is_request boolean not null default false,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(body, ''))) stored,
  unique (conversation_id, seq),
  unique (sender_id, client_id)
);
create index messages_search on messages using gin (search);
create index messages_conversation_seq on messages (conversation_id, seq desc);
create index messages_sender on messages (sender_id, created_at desc);

create table reactions (
  message_id uuid not null references messages (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table files (
  id uuid primary key,
  owner_id uuid references users (id) on delete set null,
  storage_key text not null,
  name text not null,
  mime text not null,
  size bigint not null,
  kind text not null check (kind in ('image', 'video', 'audio', 'document', 'other')),
  width int,
  height int,
  duration_ms int,
  sha256 text,
  thumb_key text,
  status text not null default 'ready' check (status in ('uploading', 'ready', 'failed')),
  upload_offset bigint not null default 0,
  created_at timestamptz not null default now()
);
create index files_owner on files (owner_id, created_at desc);

create table message_files (
  message_id uuid not null references messages (id) on delete cascade,
  file_id uuid not null references files (id) on delete cascade,
  position int not null default 0,
  primary key (message_id, file_id)
);
create index message_files_file on message_files (file_id);

-- The per-conversation asset index (PRD §26).
create table assets (
  id uuid primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  message_id uuid references messages (id) on delete cascade,
  sender_id uuid references users (id) on delete set null,
  kind text not null check (kind in ('photo', 'video', 'document', 'audio', 'link', 'location', 'contact')),
  file_id uuid references files (id) on delete set null,
  url text,
  title text,
  host text,
  created_at timestamptz not null default now()
);
create index assets_conversation on assets (conversation_id, kind, created_at desc);
create index assets_sender on assets (sender_id, kind, created_at desc);

-- ------------------------------------------------------------------------------------------
-- Actions (PRD §28–§30; PRODUCT-REVIEW R13)

create table tasks (
  id uuid primary key,
  owner_id uuid not null references users (id) on delete cascade,
  assignee_id uuid not null references users (id) on delete cascade,
  shared boolean not null default false,
  title text not null,
  notes text,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'done', 'cancelled')),
  due_at timestamptz,
  due_has_time boolean not null default false,
  remind_at timestamptz,
  reminded_at timestamptz,
  conversation_id uuid references conversations (id) on delete set null,
  message_id uuid references messages (id) on delete set null,
  context_id uuid references contexts (id) on delete set null,
  relationship_snapshot jsonb,
  source text not null default 'manual' check (source in ('manual', 'suggestion', 'request', 'import', 'kit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references users (id) on delete set null,
  search tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(notes, ''))) stored
);
create index tasks_owner on tasks (owner_id, status, due_at);
create index tasks_assignee_shared on tasks (assignee_id, status, due_at) where shared;
create index tasks_conversation on tasks (conversation_id) where conversation_id is not null;
create index tasks_remind on tasks (remind_at) where remind_at is not null and reminded_at is null and status in ('open', 'accepted');
create index tasks_search on tasks using gin (search);

create table decisions (
  id uuid primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  message_id uuid references messages (id) on delete set null,
  context_id uuid references contexts (id) on delete set null,
  title text not null,
  notes text,
  decided_by uuid references users (id) on delete set null,
  recorded_by uuid references users (id) on delete set null,
  decided_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'reversed')),
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(notes, ''))) stored
);
create index decisions_conversation on decisions (conversation_id, decided_at desc);
create index decisions_search on decisions using gin (search);

-- ------------------------------------------------------------------------------------------
-- Notifications (PRD §31–§33)

create table notifications (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  level text not null check (level in ('activity', 'attention', 'urgency')),
  title text not null,
  body text,
  data jsonb not null default '{}',
  group_key text,
  count int not null default 1,
  delivery text not null default 'silent' check (delivery in ('push', 'silent', 'held')),
  hold_until timestamptz,
  reason text,
  pushed_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);
create index notifications_group on notifications (user_id, group_key, updated_at desc) where read_at is null;
create index notifications_held on notifications (hold_until) where delivery = 'held' and pushed_at is null;

create table push_subscriptions (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  session_id uuid references sessions (id) on delete cascade,
  kind text not null check (kind in ('webpush', 'expo')),
  endpoint text not null unique,
  keys jsonb,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failures int not null default 0
);
create index push_subscriptions_user on push_subscriptions (user_id);

-- ------------------------------------------------------------------------------------------
-- Safety (PRD §55)

create table blocks (
  blocker_id uuid not null references users (id) on delete cascade,
  blocked_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create index blocks_blocked on blocks (blocked_id);

create table reports (
  id uuid primary key,
  reporter_id uuid references users (id) on delete set null,
  target_user_id uuid references users (id) on delete set null,
  message_id uuid,
  conversation_id uuid,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------------------
-- Platform plumbing (PRD §78, §81)

create table domain_events (
  id bigserial primary key,
  type text not null,
  actor_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index domain_events_type on domain_events (type, id);

create table jobs (
  id bigserial primary key,
  kind text not null,
  payload jsonb not null default '{}',
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  done_at timestamptz,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index jobs_ready on jobs (run_at) where done_at is null;

create table audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  target text,
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_actor on audit_log (actor_id, created_at desc);

create table ai_runs (
  id uuid primary key,
  user_id uuid references users (id) on delete set null,
  feature text not null,
  provider text not null,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  outcome text not null,
  created_at timestamptz not null default now()
);

create table server_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
