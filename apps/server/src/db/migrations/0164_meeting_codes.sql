-- A meeting's short address (M16 F6d): `cai.me/m/xxx-xxxx-xxx`, ten letters for a card held on
-- Caime, made the first time a calendar is written its event and gone with the card. It names
-- nobody: opened, it leads someone in the card's conversation to the card and its call, and
-- anyone else nowhere, as a code nobody holds does.
create table if not exists meeting_codes (
  code text primary key,
  message_id uuid not null unique references messages (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Which meeting a call is (M16 F6e): decided once, as the call is placed, the meeting or
-- appointment held here whose Join is open in that conversation then; none for any other call.
-- What came of the call (Cai's notes) is the meeting's by it, and it goes with the card.
alter table calls add column if not exists card_id uuid references messages (id) on delete set null;
create index if not exists calls_card on calls (card_id) where card_id is not null;
