-- An OAuth app's secret replaced keeps being taken for a day (M16 G1), as an organization's
-- webhook secret keeps signing, so the app's servers move to the new one in their own time: the
-- old one's hash and until when it's taken. A hash only, as the current one is kept.
alter table oauth_clients add column if not exists previous_secret_hash bytea;
alter table oauth_clients add column if not exists previous_secret_until timestamptz;
