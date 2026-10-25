-- One fold for what people typed and what was written (M17 I5, convention 17): the database's
-- `caime_fold` and core's `foldForFind` (`fold.ts`) are twins, held equal by
-- `retrieval-golden.test.ts`, step for step: NFKD and Latin's combining marks out (é, ş, ü, a
-- dotted İ to their letters), NFC again (so ؤ and ئ keep their seats), Arabic's marks and the
-- tatweel out, the alef forms to ا, ى to ي, ة to ه, then lower case, and the letters that never
-- decompose (ı, ø, ł, œ, æ) to plain ones: after the marks go, every Latin letter left is ASCII or
-- one of those, so the fold is the same whatever the database's ctype. Immutable, so an index may
-- be built over it.
create function caime_fold(t text) returns text
  language sql immutable parallel safe strict
  return translate(
    replace(
      replace(
        lower(
          replace(
            replace(
              translate(
                translate(
                  regexp_replace(
                    normalize(regexp_replace(normalize(t, NFKD), '[\u0300-\u036f]', '', 'g'), NFC),
                    '[\u064b-\u0670\u0640]', '', 'g'
                  ),
                  'أإآٱىة',
                  'اااايه'
                ),
                'ØŁ',
                'øł'
              ),
              'Œ', 'œ'
            ),
            'Æ', 'æ'
          )
        ),
        'œ', 'oe'
      ),
      'æ', 'ae'
    ),
    'ıøł',
    'iol'
  );

-- What the index holds of a text (M17 I5): the text folded, and each Arabic word that carries the
-- article or a joined conjunction once more without it ("العرض" is also "عرض", "والعقد" "عقد",
-- "للعميل" "عميل", "وأحمد" "احمد"), so a word typed bare finds it as written, as a substring
-- search would, while a prefix query still never matches a word's end. The variants are added,
-- never put in the word's place, so the word as written is found too; a bare "و" is taken off only
-- before three letters or more. The server's `bareArabic` (`lib/fold-sql.ts`) is its twin, for
-- the snippet's marks.
create function caime_find_text(t text) returns text
  language sql immutable parallel safe strict
  return (
    select caime_fold(t) || coalesce(' ' || string_agg(bare, ' '), '')
    from (
      select case
          when w ~ '^(وال|بال|كال|فال)..' then substr(w, 4)
          when w ~ '^(ال|لل)..' then substr(w, 3)
          when w ~ '^و...' then substr(w, 2)
        end as bare
      from regexp_split_to_table(caime_fold(t), '[^\u0621-\u064a]+') as w
    ) as words
    where bare is not null
  );

-- What a message says of itself (migration 0065's text, as one function so the index and the
-- query name the same expression): its words, a card's title, reference, summary and what was
-- booked, the joiners the parser keeps inside a token made spaces first.
create function caime_search_text(body text, payload jsonb) returns text
  language sql immutable parallel safe
  return translate(
    coalesce(body, '') || ' ' ||
    coalesce(payload->>'title', '') || ' ' ||
    coalesce(payload->'fields'->>'reference', '') || ' ' ||
    coalesce(payload->'fields'->>'summary', '') || ' ' ||
    coalesce(payload->'booking'->>'name', ''),
    '-+./@:',
    '      '
  );

-- Decisions are few: their folded index is built here. The big tables' follow, concurrently.
create index decisions_search_fold on decisions
  using gin (to_tsvector('simple', caime_find_text(coalesce(title, '') || ' ' || coalesce(notes, ''))));
