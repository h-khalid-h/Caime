-- Cai answers a line that calls it once (M17 I13h): asked about the screen, it asks the recording
-- device for a picture and answers from the first of its jobs to arrive (the picture, or the
-- wait), which claims the line here. Expand only: one column, null for every line so far.
alter table call_note_lines add column if not exists cai_answered_at timestamptz;
