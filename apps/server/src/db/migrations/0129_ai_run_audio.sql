-- What a transcript's recording lasted (M16 H7): a speech provider bills by the minute, so the
-- operator's cost per person prices a transcript by it. Expand only: a nullable column, no backfill
-- (older runs keep no length and are counted as unpriced).
alter table ai_runs add column if not exists audio_ms integer;
