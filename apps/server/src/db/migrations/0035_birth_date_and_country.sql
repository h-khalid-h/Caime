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
-- a card with an amount. Until now it was only the region of their device's language, when that
-- named a country; one that named a wider region (Latin America, 419) says nothing of it.
alter table users rename column region to country;
update users set country = null where country !~ '^[A-Z]{2}$';
alter table users add constraint users_country check (country ~ '^[A-Z]{2}$');

-- Where an organization is based (its creator's country until it says otherwise), and the year it
-- began, shown on its page if it says.
alter table organizations add column country text check (country ~ '^[A-Z]{2}$');
update organizations o set country = u.country from users u where u.id = o.created_by;
alter table organizations add column founded_year smallint check (founded_year between 1000 and 9999);
