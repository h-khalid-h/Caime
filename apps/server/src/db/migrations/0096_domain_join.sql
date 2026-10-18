-- Domain auto-join (M16 C3b, review 2026-10-17 §1 H3): a verified organization may let anyone
-- with a proven address at its domain join its team without an invite. Off until its owner or an
-- admin turns it on.
alter table organizations add column domain_join boolean not null default false;

-- When someone was taken off a team by its owner or an admin (never when they left themselves):
-- they come back only when a manager or an invite brings them, never by their address alone.
-- Cleared when they're seated again.
alter table org_members add column removed_at timestamptz;
