-- R86: a guest's answer to their invitation, as their calendar app sent it back to Cai's
-- address (accepted, declined, tentative), and when.
alter table meeting_guests
  add column answer text check (answer in ('accepted', 'declined', 'tentative')),
  add column answered_at timestamptz;
