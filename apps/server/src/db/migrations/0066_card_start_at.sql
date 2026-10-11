-- A meeting's or an appointment's start as a column (review 2026-10-09 M21): the calendar, the
-- slots, the briefs and search read cards by when they're for, and read every payload in the
-- conversations asked for until now. Written by the server with the card; backfilled here.
alter table messages add column card_start_at timestamptz;
update messages
  set card_start_at = (payload->'fields'->'start'->>'at')::timestamptz
  where kind = 'kit'
    and payload->>'kit' in ('meeting', 'appointment')
    and payload->'fields'->'start'->>'at' ~ '^\d{4}-\d{2}-\d{2}T';
create index messages_card_start on messages (conversation_id, card_start_at)
  where card_start_at is not null;

-- Four foreign keys without an index (the review's L): a person's deletion or a file's walks
-- each table otherwise.
create index business_threads_erased_by on business_threads (erased_by)
  where erased_by is not null;
create index org_checkout_connected_by on org_checkout (connected_by)
  where connected_by is not null;
create index oauth_clients_icon_file on oauth_clients (icon_file_id)
  where icon_file_id is not null;
create index oauth_clients_org on oauth_clients (org_id) where org_id is not null;
