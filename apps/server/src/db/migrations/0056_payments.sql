-- Ways to be paid (R62): a host's payment methods with their audiences (core PaymentSettings),
-- or null for none. Caime never holds or moves money; a Pay card carries a copy of the ways the
-- payer may see.
alter table users add column payments jsonb;
alter table organizations add column payments jsonb;
