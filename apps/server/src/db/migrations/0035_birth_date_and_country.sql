-- A person's date of birth, where it was only its year (packages/core safety.ts): ages are exact,
-- on the day where they are. A year alone becomes its last day, so nobody who signed up with one
-- is taken for older than they can be; a person without either is taken to be 13, the youngest
-- anyone can be here, so every protection for under-18s holds for them.
alter table users add column birth_date date;
update users set birth_date = make_date(birth_year, 12, 31) where birth_year is not null;
update users set birth_date = current_date - interval '13 years'
  where kind = 'human' and birth_date is null;
alter table users drop column birth_year;
alter table users add constraint users_birth_date
  check (kind <> 'human' or birth_date is not null);

-- Where someone lives (ISO 3166-1), which sets their defaults: the work week, and the currency of
-- a card with an amount. Nobody has said it yet: the region of their device's language, all there
-- was, is a guess, never where they live, so it goes, and each person chooses (Profile, Language
-- and region).
alter table users drop column region;
alter table users add column country text;
alter table users add constraint users_country check (country ~ '^[A-Z]{2}$');

-- Where an organization is based, shown on its page, and the year it began, if it says: its
-- owner says where (Edit details asks before anything else is saved), never inferred from anyone.
alter table organizations add column country text check (country ~ '^[A-Z]{2}$');
alter table organizations add column founded_year smallint check (founded_year between 1000 and 9999);
