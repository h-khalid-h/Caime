-- A replaced webhook secret keeps signing deliveries for a day (REVIEW-2026-10-05, integration):
-- the one before, and until when it still counts.
alter table org_apps add column previous_webhook_secret text;
alter table org_apps add column previous_secret_until timestamptz;
