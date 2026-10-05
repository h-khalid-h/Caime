-- Recovery codes are no longer a gate at sign-up (docs/PRODUCT-REVIEW.md, R56): the app keeps
-- them on the device until the person says they're saved, from a card on Chats, and records
-- that here so no device asks again. Null: never acknowledged (the card shows, and offers to
-- make new ones when the fresh ones are gone).
alter table users add column if not exists recovery_codes_seen_at timestamptz;
