-- Writing to an organization as one's own (R64): a business conversation's customer may be a
-- person acting for an organization they manage. One conversation per organization, customer and
-- the organization they write for (or none), so writing as oneself and as one's organization are
-- two conversations.
alter table business_threads
  add column customer_org_id uuid references organizations (id) on delete set null;
create unique index business_threads_customer_as
  on business_threads (org_id, customer_id, coalesce(customer_org_id, '00000000-0000-0000-0000-000000000000'::uuid));
drop index if exists business_threads_customer;
create index business_threads_customer_org on business_threads (customer_org_id)
  where customer_org_id is not null;
