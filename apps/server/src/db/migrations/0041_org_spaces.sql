-- An organization's spaces (R43): a space its owner or an admin started for it. Its team can be
-- in it without being connections; leaving the team leaves it; the organization closing leaves
-- the space to its people, as an ordinary one.
alter table spaces add column org_id uuid references organizations (id) on delete set null;
create index spaces_org on spaces (org_id) where org_id is not null;
