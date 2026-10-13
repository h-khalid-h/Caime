-- R84, R85 (3): when a guest first came in by their link, and whether they said they're 18 or
-- over (no answer, or no, and nothing is recorded in their meeting).
alter table meeting_guests
  add column joined_at timestamptz,
  add column adult boolean;
