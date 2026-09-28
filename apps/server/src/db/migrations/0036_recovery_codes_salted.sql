-- Every recovery code is a slow hash with its account's salt (0033, lib/crypto.ts): the few made
-- before, kept as fast hashes, go (whoever had them makes new ones in Security), and a code
-- can't be kept without its salt again.
delete from recovery_codes where salt is null;
alter table recovery_codes alter column salt set not null;
