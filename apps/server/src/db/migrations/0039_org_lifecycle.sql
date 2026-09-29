-- Closing an organization, and taking it back (R42). A closed organization's row stays, with
-- everything its customers were sent; its handle stays in the namespace only while it was
-- verified (whoever proves its domain again continues it as a new row with the same handle,
-- `succeeded_by`), else it's held a year like a person's and then free. So two rows may carry
-- one handle: only one of them open.
alter table organizations drop constraint organizations_handle_key;
create unique index organizations_handle_open on organizations (handle) where archived_at is null;
-- Who is proving the domain to take a closed organization back, and the record they must add.
alter table organizations add column reclaim_by uuid references users (id) on delete set null;
alter table organizations add column reclaim_token text;
-- The open organization that continues a closed one.
alter table organizations add column succeeded_by uuid references organizations (id) on delete set null;
