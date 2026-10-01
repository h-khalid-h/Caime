-- Bookings (R51): an organization's bookable hours, as the app sets them (core BookingHoursBody:
-- a time zone, a slot length, a range per weekday, a lead time and a horizon). Null means it
-- takes no bookings; the open slots are worked out from these and the appointment cards in its
-- customer conversations, never kept.
alter table organizations add column booking jsonb;
