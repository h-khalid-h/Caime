-- Orders from the catalog (R60): how a host takes orders (core OrderingSettings), or null for none.
alter table users add column ordering jsonb;
alter table organizations add column ordering jsonb;
