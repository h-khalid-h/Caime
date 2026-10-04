-- What a clinic's lawyer needs (R54). An organization keeps its customers' conversations for a
-- time it sets (days; null keeps them), applied to each message as the conversation's own
-- disappearing setting is (messages.expires_at, the earlier of the two). A conversation erased
-- at a customer's request says so on its thread: when, and who on the team did it.
alter table organizations add column retention_days integer
  check (retention_days is null or (retention_days >= 1 and retention_days <= 3650));
alter table business_threads add column erased_at timestamptz;
alter table business_threads add column erased_by uuid references users(id) on delete set null;
