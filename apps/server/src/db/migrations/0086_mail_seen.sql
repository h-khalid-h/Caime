-- Mail that reads like chat (R75): a mail's signature set apart from its words, and how far a
-- mail sent got past delivery: seen (they replied, or opened it in Caime) and opened (the mail
-- provider's open pixel, only on mail that carried one, `track_opens`).
alter table mail_messages
  add column signature text,
  add column seen_at timestamptz,
  add column opened_at timestamptz,
  add column track_opens boolean not null default false;
