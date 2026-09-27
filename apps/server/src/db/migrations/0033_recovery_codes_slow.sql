-- Recovery codes are hashed slowly with a salt of their account's own (lib/crypto.ts), so a copy
-- of the database can't be tried against every possible code. Codes made before this keep their
-- fast hash (no salt) and still work until they're used or new ones are made.
alter table recovery_codes add column salt bytea;
