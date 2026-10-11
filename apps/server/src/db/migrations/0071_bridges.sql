-- A bridge's token (PRODUCT-REVIEW R79): a personal token made for an automation platform
-- (Zapier, Make, n8n, Pipedream, IFTTT), named after it, one live per person and platform.
-- Discover counts who has each on from this column; Connected lists it as the platform.
alter table personal_tokens add column bridge text;
create unique index personal_tokens_bridge_live on personal_tokens (bridge, user_id)
  where bridge is not null and revoked_at is null;
