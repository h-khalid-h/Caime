-- A sealed ticket spent once (M16 G1): its nonce, kept from its first opening until the ticket
-- would have expired anyway (swept daily), so the same ticket opens nothing a second time. What
-- the ticket says stays sealed in it; only the nonce is a row. Google's picker page is the first.
create table if not exists spent_tickets (
  id uuid primary key,
  expires_at timestamptz not null
);
