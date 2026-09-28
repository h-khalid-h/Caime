-- Download your data (lib/export.ts) finds the copies made for an organization's apps of what
-- someone sent it, by the customer each names (lib/business.ts, lib/kits.ts): without this it read
-- every delivery kept, 30 days of every organization's.
create index webhook_deliveries_customer
  on webhook_deliveries ((payload->'data'->'customer'->>'id'))
  where (payload->'data'->'customer'->>'id') is not null;
