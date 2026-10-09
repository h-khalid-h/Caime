-- Taking a closed organization back (R42): a record per person who asks, so nobody's start
-- overwrites another's and nobody burns another's tries. The organization's own reclaim_by and
-- reclaim_token stay for a release (expand first), unread.
create table org_reclaims (
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  token text not null,
  created_at timestamptz not null,
  primary key (org_id, user_id)
);
