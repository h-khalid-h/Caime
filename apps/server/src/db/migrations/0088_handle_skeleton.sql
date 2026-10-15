-- A handle's skeleton (docs/HANDLES.md, core `handleSkeleton`): what it reads as, separators out,
-- 0 as o, 1 and i as l, 5 as s, rn as m, vv as w. Two handles with one skeleton are one name to a
-- reader, so a new one is refused when another person's or organization's has the same.
alter table users
  add column handle_skeleton text generated always as (
    replace(replace(translate(regexp_replace(lower(handle), '[._-]', '', 'g'), '01i5', 'olls'), 'rn', 'm'), 'vv', 'w')
  ) stored;
alter table organizations
  add column handle_skeleton text generated always as (
    replace(replace(translate(regexp_replace(lower(handle), '[._-]', '', 'g'), '01i5', 'olls'), 'rn', 'm'), 'vv', 'w')
  ) stored;
create index users_handle_skeleton on users (handle_skeleton);
create index organizations_handle_skeleton on organizations (handle_skeleton);
