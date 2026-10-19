-- Org apps' webhook signing secrets sealed through the vault (M16 G1, REVIEW-2026-10-17 §11 (b)):
-- each sealed value beside the id of the key that sealed it, next to the clear columns, which this
-- release still writes for a container of the last one running while it deploys; the next release
-- empties them (the reason `webhook_secret` may be null from here) and a later one drops them.
-- Expand only: nullable columns, nothing rewritten.
alter table org_apps add column if not exists webhook_secret_sealed bytea;
alter table org_apps add column if not exists webhook_secret_kid text;
alter table org_apps add column if not exists previous_secret_sealed bytea;
alter table org_apps add column if not exists previous_secret_kid text;
alter table org_apps alter column webhook_secret drop not null;
