-- Mail whose sender Caime couldn't confirm (M16 F1, R75 (1); review 2026-10-17 §6): kept for the
-- person it was sent to, as a notice that says so, from a stand-in of its own, where it was
-- dropped. False for everything before it, all of which was confirmed. A default of a constant
-- adds the column without writing a row.
alter table mail_messages add column if not exists unverified boolean not null default false;
