-- What a call cost when it ran (M16 G9, R107): its tokens or its recording priced by the server's
-- one price list (`lib/ai-costs.ts`) that day, in US dollars, and a call the list can't price at
-- the dearest listed rate for what it used, never at nothing. An allowance counts this, never the
-- number of calls. Null for calls made before it, which a day's window soon leaves behind.
alter table ai_runs add column if not exists cost_usd double precision;
