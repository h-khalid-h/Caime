import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

/**
 * Every date and time Caime keeps says by its name what kind of time it holds (R119,
 * docs/TIME.md): `_at` a moment (timestamptz, UTC), `_on` a day (date), `_local` a wall-clock
 * time (timestamp without a zone, beside its zone), `_from` and `_until` a range's ends (`from`
 * included, `until` excluded). Held to the schema the migrations make, so a new column follows it.
 */
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

/**
 * Named before the convention, each with what it means; renamed when a slice touches it anyway,
 * so this list only shrinks.
 */
const EARLIER: Record<string, string> = {
  'billing_subscriptions.current_period_end': "Stripe's period end: current_period_until",
  'call_note_answers.at': 'when the answer was given: answered_at',
  'relationship_events.at': 'when it happened: happened_at',
  'users.birth_date': 'a day, floating: born_on',
};

const TIME_TYPES = [
  'date',
  'timestamp with time zone',
  'timestamp without time zone',
  'time with time zone',
  'time without time zone',
  'interval',
];

/** What a name's suffix allows it to hold. */
const SUFFIXES: Array<[RegExp, string[]]> = [
  [/_at$/, ['timestamp with time zone']],
  [/_on$/, ['date']],
  [/_local$/, ['timestamp without time zone']],
  [/_(from|until)$/, ['date', 'timestamp with time zone', 'timestamp without time zone']],
];

describe('time names (R119)', () => {
  it('every date and time column is named for the kind of time it holds', async () => {
    const rows = await sql<{ table_name: string; column_name: string; data_type: string }>`
      select c.table_name, c.column_name, c.data_type
        from information_schema.columns c
        join information_schema.tables tb
          on tb.table_name = c.table_name and tb.table_schema = c.table_schema
       where c.table_schema = 'public' and tb.table_type = 'BASE TABLE'
         and c.data_type in (${sql.join(TIME_TYPES)})
    `.execute(t.ctx.db);
    expect(rows.rows.length).toBeGreaterThan(200);
    const wrong: string[] = [];
    const earlier: string[] = [];
    for (const r of rows.rows) {
      const name = `${r.table_name}.${r.column_name}`;
      const kind = SUFFIXES.find(([suffix]) => suffix.test(r.column_name));
      const fits = kind?.[1].includes(r.data_type) ?? false;
      if (name in EARLIER) {
        if (!fits) earlier.push(name);
        continue;
      }
      if (!fits) wrong.push(`${name} (${r.data_type})`);
    }
    expect(wrong, 'a date or time column whose name or type breaks docs/TIME.md').toEqual([]);
    // Once renamed, an earlier name leaves the list.
    expect(earlier.sort()).toEqual(Object.keys(EARLIER).sort());
  });
});
