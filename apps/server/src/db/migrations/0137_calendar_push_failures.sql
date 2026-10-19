-- What Caime couldn't write into a connected calendar, one row per event (M16 G4, review
-- 2026-10-17 §8 M): a plan the provider refuses on its own (a 400, say) is sent as it is
-- `PUSH_TRIES` times at most and then waits for its card to change, while the rest of the plans
-- go in; one event never holds up a whole account, nor is it asked again every sweep. Its row
-- goes once it's written, once it's no longer a plan, and with its connection.
create table if not exists calendar_push_failures (
  account_id uuid not null references connected_accounts (id) on delete cascade,
  uid text not null,
  -- The plan as it was refused (calendar_pushes' fingerprint), or 'remove' for one not taken out.
  fingerprint text not null,
  status integer not null,
  attempts integer not null default 1,
  failed_at timestamptz not null,
  primary key (account_id, uid)
);
