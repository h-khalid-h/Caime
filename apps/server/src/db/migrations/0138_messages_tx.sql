-- A person's feed (M16 G5, review 2026-10-17 §11 step 6): each new message keeps the
-- transaction that wrote it, so the feed hands on only what lies below the oldest transaction
-- still running in this database, and in that order, never past a message still being
-- written. An expansion: the column has no default for the rows already here (what came before
-- is history, never news), and new rows take the transaction's id from now on.
alter table messages add column if not exists tx xid8;
alter table messages alter column tx set default pg_current_xact_id();

-- Run by hand after restoring a backup into a new database cluster (docs/DEPLOY.md): a new
-- cluster counts transactions from the start again, so the restored rows' ids would read as
-- news once its count passed them. They're history: forgotten a thousand at a time, each batch
-- committed, in the order of the primary key.
create or replace procedure caime_feed_forget() language plpgsql as $$
declare
  last uuid := '00000000-0000-0000-0000-000000000000';
  top uuid;
begin
  loop
    select b.id into top from (
      select id from messages where id > last order by id limit 1000
    ) b order by b.id desc limit 1;
    exit when top is null;
    update messages set tx = null where id > last and id <= top and tx is not null;
    last := top;
    commit;
  end loop;
end $$;
