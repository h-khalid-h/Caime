-- How each use of a connected account last went (M16 G2, review 2026-10-17 §8 H3): the busy read
-- and the plan push each keep why their last try failed and when, beside when they last worked
-- (`synced_at`, `pushed_at`, now written only when they work), so a good read never hides a
-- failing push or the other way round; and until when the provider asked Caime to wait (a 429's
-- Retry-After). `state` keeps the connection's own standing ('reconnect' once its grant is gone);
-- 'failing' is no longer written, and a row the release before marked so reads as failing until
-- its next read or push works.
alter table connected_accounts add column if not exists read_failure text;
alter table connected_accounts add column if not exists read_failed_at timestamptz;
alter table connected_accounts add column if not exists push_failure text;
alter table connected_accounts add column if not exists push_failed_at timestamptz;
alter table connected_accounts add column if not exists rest_until timestamptz;
