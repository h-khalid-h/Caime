/**
 * Migrations that change data, run on rows as they were before them. Tests otherwise clone a
 * database built from every migration with nothing in it, so a migration's data steps would never
 * meet any data.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, migrationsDir } from '../src/db/migrate';
import { adminUrl, dropDatabase, urlFor } from './global-setup';

const name = `caishy_t_migrations_${randomBytes(4).toString('hex')}`;
let pool: pg.Pool;
let dir: string;

/** Every migration before `next` ('0035') applied, and nothing after. */
async function migrateBefore(next: string) {
  for (const file of await readdir(migrationsDir()))
    if (file.endsWith('.sql') && file < next)
      await copyFile(join(migrationsDir(), file), join(dir, file));
  await migrate(pool, () => {}, dir);
}

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: urlFor(name), max: 1 });
  dir = await mkdtemp(join(tmpdir(), 'caishy-migrations-'));
});
afterAll(async () => {
  await pool.end();
  await rm(dir, { recursive: true, force: true });
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await dropDatabase(admin, name);
  await admin.end();
});

const person = async (
  handle: string,
  fields: { birth_year?: number | null; region?: string | null; kind?: string },
) => {
  const id = randomUUID();
  await pool.query(
    `insert into users (id, email, handle, password_hash, display_name, privacy, kind, birth_year, region)
     values ($1, $2, $3, 'x', $4, '{}', $5, $6, $7)`,
    [
      id,
      `${handle}@example.com`,
      handle,
      handle,
      fields.kind ?? 'human',
      fields.birth_year ?? null,
      fields.region ?? null,
    ],
  );
  return id;
};

describe('0035: a date of birth and a country', () => {
  it('turns a year into its last day and the unknown into 13, and infers nobody’s country', async () => {
    await migrateBefore('0035');
    const ids = {
      egypt: await person('egypt', { birth_year: 1990, region: 'EG' }),
      unknown: await person('unknown', { region: '419' }),
      canaries: await person('canaries', { birth_year: 2009, region: 'IC' }),
      kosovo: await person('kosovo', { birth_year: 1985, region: 'XK' }),
      bot: await person('bot', { kind: 'bot' }),
    };
    const org = async (handle: string, by: string) =>
      pool.query(
        `insert into organizations (id, name, handle, kind, created_by) values ($1, $2, $3, 'business', $4)`,
        [randomUUID(), handle, handle, by],
      );
    await org('nile', ids.egypt);
    await org('isla', ids.canaries);
    await migrateBefore('0036');
    const { rows } = await pool.query<{
      handle: string;
      born: string | null;
      thirteen: boolean;
      country: string | null;
    }>(
      `select handle, to_char(birth_date, 'YYYY-MM-DD') as born, country,
              birth_date = (current_date - interval '13 years')::date as thirteen
         from users order by handle`,
    );
    const by = Object.fromEntries(rows.map((r) => [r.handle, r]));
    // Nobody is taken for older than they can be; the unknown for the youngest anyone can be. A
    // device language's region was a guess, never where someone lives: each person says.
    expect(by.egypt).toMatchObject({ born: '1990-12-31', country: null });
    expect(by.canaries).toMatchObject({ born: '2009-12-31', country: null });
    expect(by.unknown).toMatchObject({ thirteen: true, country: null });
    expect(by.kosovo).toMatchObject({ born: '1985-12-31', country: null });
    expect(by.bot).toMatchObject({ born: null, country: null });
    const orgs = await pool.query<{ handle: string; country: string | null }>(
      'select handle, country from organizations order by handle',
    );
    // Nor is an organization said to be based where its creator's device was: its page would
    // publish the guess.
    expect(orgs.rows).toEqual([
      { handle: 'isla', country: null },
      { handle: 'nile', country: null },
    ]);
    // From now on a person has a date of birth, and a country is a code.
    await expect(
      pool.query(`update users set birth_date = null where handle = 'egypt'`),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(`update users set country = 'eg' where handle = 'egypt'`),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('0036: recovery codes only as slow hashes', () => {
  it('lets go of fast-hashed codes and keeps the salted', async () => {
    await migrateBefore('0036');
    const { rows } = await pool.query<{ id: string }>(
      `select id from users where handle = 'egypt'`,
    );
    const owner = rows[0]!.id;
    const code = (salt: Buffer | null) =>
      pool.query(
        'insert into recovery_codes (id, user_id, code_hash, salt) values ($1, $2, $3, $4)',
        [randomUUID(), owner, randomBytes(32), salt],
      );
    await code(null);
    await code(randomBytes(16));
    await migrateBefore('0037');
    const kept = await pool.query<{ salted: boolean }>(
      'select salt is not null as salted from recovery_codes',
    );
    expect(kept.rows).toEqual([{ salted: true }]);
    await expect(code(null)).rejects.toMatchObject({ code: '23502' });
  });
});
