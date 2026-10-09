-- Search finds cards too (review 2026-10-09 H5): what a card says of itself (its title, a
-- reference, what was booked or ordered, an order's summary) is indexed beside the words. The
-- old `search` column stays for a release (expand first); the query reads this one.
-- The joiners the parser keeps inside a token (a hyphen or a sign on a number, the dots of a
-- host, the "@" of an address, a path's "/" and ":") are spaces first, so every word a person
-- sees is a lexeme of its own and a search typed as words finds it: "INV-7731" is "inv" and
-- "7731" (the parser alone reads a signed "-7731"), "nile.dental" is "nile" and "dental". The
-- query splits what's typed the same way (modules/search.ts, prefixQuery).
alter table messages add column search_all tsvector generated always as (
  to_tsvector(
    'simple',
    translate(
      coalesce(body, '') || ' ' ||
      coalesce(payload->>'title', '') || ' ' ||
      coalesce(payload->'fields'->>'reference', '') || ' ' ||
      coalesce(payload->'fields'->>'summary', '') || ' ' ||
      coalesce(payload->'booking'->>'name', ''),
      '-+./@:',
      '      '
    )
  )
) stored;
create index messages_search_all on messages using gin (search_all);
