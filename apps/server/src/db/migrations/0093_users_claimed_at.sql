-- When a provisional person (R75, R84, R97: mail, a meeting's guest, a booking made before an
-- account) became an account by proving the address with its code (review 2026-10-17 §2 H1).
-- Null for everyone who signed up fresh, and for anyone claimed before this release. Product
-- metrics read it for one number: of the people who booked before an account, how many joined
-- within thirty days (REVIEW §14, advantage 3).
alter table users add column claimed_at timestamptz;
