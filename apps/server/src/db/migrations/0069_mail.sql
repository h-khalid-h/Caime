-- Caime Mail (PRODUCT-REVIEW R75, phase 1): a handle is also an address at MAIL_DOMAIN. A sender
-- who isn't on Caime is a provisional person: a users row the person they wrote to can see and
-- nobody can find, claimed by signing up with that address.
alter table users drop constraint users_kind_check;
alter table users add constraint users_kind_check
  check (kind in ('human', 'bot', 'agent', 'assistant', 'character', 'provisional'));
-- A message that came or went as mail says so; the rest of it is a message like any other.
alter table messages add column channel text check (channel in ('mail'));
-- What a mail message is on the wire: its ids for threading, who it was between, its subject,
-- and for one sent, how far it got (sent, delivered, bounced) as the provider tells it.
create table mail_messages (
  message_id uuid primary key references messages (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  rfc_message_id text not null,
  in_reply_to text,
  references_ids text[] not null default '{}',
  from_address text not null,
  to_address text not null,
  subject text,
  provider text not null,
  provider_id text,
  delivery text check (delivery in ('sent', 'delivered', 'bounced')),
  delivery_at timestamptz,
  delivery_detail text,
  created_at timestamptz not null default now()
);
-- The same mail delivered twice (a provider's retry) is one message per address it reached.
create unique index mail_messages_rfc_to on mail_messages (rfc_message_id, to_address);
create index mail_messages_provider_id on mail_messages (provider, provider_id)
  where provider_id is not null;
