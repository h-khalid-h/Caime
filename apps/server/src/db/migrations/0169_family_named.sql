-- R122 (2), M16 B8c: a parent named by the child, an age corrected under the same rules, and
-- where an age comes from. Expands only.

-- How a child's wait began: their parent's link (R122), their own sign-up naming a parent, or a
-- date of birth they corrected; how many adults they've asked (three at most); the one link they
-- may send a parent who isn't on Caime yet; the day of birth the parent saw when agreeing; a
-- correction a looked-after child asked of their parent (a day of birth, or where they live).
alter table guardianships
  add column if not exists began text not null default 'link'
    check (began in ('link', 'sign_up', 'corrected'));
alter table guardianships add column if not exists asks smallint not null default 0;
alter table guardianships add column if not exists ask_token_hash bytea;
alter table guardianships add column if not exists ask_expires_at timestamptz;
alter table guardianships add column if not exists asked_born_on date;
alter table guardianships add column if not exists asked_country text;
alter table guardianships add column if not exists correction_asked_at timestamptz;
create unique index if not exists guardianships_ask_token
  on guardianships (ask_token_hash) where ask_token_hash is not null;

-- The day of birth a parent agreed to (R122 (2)): the age's source is theirs while it's the day on
-- the account; any change clears it.
alter table users add column if not exists birth_date_confirmed_at timestamptz;

-- An adult who said a child's account isn't their child's: never asked again by that account.
create table if not exists family_refusals (
  child_id uuid not null references users(id) on delete cascade,
  guardian_id uuid not null references users(id) on delete cascade,
  refused_at timestamptz not null,
  primary key (child_id, guardian_id)
);
create index if not exists family_refusals_guardian on family_refusals (guardian_id);

-- Moderate (M16 B8d): a parent's yes reaches every new way in, never a message's words.
alter table guardianships add column if not exists moderates boolean not null default false;

-- What a parent who moderates says yes to before their child goes on (R122 (2), Moderate): an
-- invitation into a group or a space, an ask to join one, a message request the child would take,
-- or an organization the child would start writing to. Never a message's words.
create table if not exists guardian_asks (
  id uuid primary key,
  guardian_id uuid not null references users(id) on delete cascade,
  child_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('invite', 'join', 'request', 'organization')),
  place_invite_id uuid references place_invites(id) on delete cascade,
  join_link_id uuid references join_links(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  created_at timestamptz not null,
  answered_at timestamptz,
  answer text check (answer in ('yes', 'no'))
);
create index if not exists guardian_asks_guardian on guardian_asks (guardian_id);
create index if not exists guardian_asks_child on guardian_asks (child_id);
create index if not exists guardian_asks_place_invite on guardian_asks (place_invite_id);
create index if not exists guardian_asks_join_link on guardian_asks (join_link_id);
create index if not exists guardian_asks_conversation on guardian_asks (conversation_id);
create index if not exists guardian_asks_org on guardian_asks (org_id);
-- One open ask a child and a thing.
create unique index if not exists guardian_asks_open on guardian_asks (
  child_id, kind, coalesce(place_invite_id, join_link_id, conversation_id, org_id)
) where answered_at is null;
