-- R90: a person's Google or Microsoft account, connected for the uses they turn on. The refresh
-- token is sealed with a server key (lib/vault.ts), never a column of plain text; the access it
-- renews lives in memory only. Of a calendar, only when the person is busy: no titles, no
-- attendees, nothing else (external_busy).
create table connected_accounts (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  -- The provider's own id for the account, so connecting it again replaces the connection.
  subject text not null,
  email text,
  uses text[] not null default '{}',
  scopes text[] not null default '{}',
  refresh_sealed bytea not null,
  state text not null default 'connected' check (state in ('connected', 'reconnect', 'failing')),
  created_at timestamptz not null default now(),
  synced_at timestamptz,
  unique (user_id, provider, subject)
);
create index connected_accounts_user on connected_accounts (user_id);
-- The sweep: calendars connected and working, the longest unread first.
create index connected_accounts_sync on connected_accounts (synced_at nulls first)
  where state <> 'reconnect';

create table external_busy (
  account_id uuid not null references connected_accounts (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null
);
create index external_busy_user on external_busy (user_id, start_at);
create index external_busy_account on external_busy (account_id);
