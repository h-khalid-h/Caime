-- no-transaction
-- The meetings and appointments that keep their own clock (M17 I19c, R119): their start's zone
-- and wall-clock minute beside its instant, so the cards still ahead are found by their start
-- when the time-zone rules change (`rezoneCards`, lib/card-zones.ts), without reading every
-- message. Partial, so it holds only those cards; built concurrently so writes never wait.
create index concurrently if not exists messages_card_clock on messages (card_start_at, id)
  where (payload->'fields'->'start'->>'local') is not null;
