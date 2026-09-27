-- Someone's automations, read by collection (their Saved page, renaming or emptying one) and
-- by person whether they're on or off: the index on enabled ones alone doesn't serve those.
create index automations_user_collection on automations (user_id, collection);
-- What was saved of one file or link, found when it goes (taken out of an album, or its message
-- deleted): without it, each of those read every saved item there is.
create index saved_items_asset on saved_items (asset_id) where asset_id is not null;
