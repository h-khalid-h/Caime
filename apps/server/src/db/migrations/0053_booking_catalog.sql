-- Bookings for people as well as organizations, and a catalog of what can be booked (R58):
-- a person's hours (as organizations.booking), and each host's items (core BookingItem[]).
alter table users add column booking jsonb;
alter table users add column booking_items jsonb not null default '[]'::jsonb;
alter table organizations add column booking_items jsonb not null default '[]'::jsonb;
