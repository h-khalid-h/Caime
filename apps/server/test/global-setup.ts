/**
 * Creates a migrated template database once per run; every test file clones it
 * (CREATE DATABASE … TEMPLATE) so files are isolated and fast.
 * Uses TEST_DATABASE_URL (a role with CREATEDB), defaulting to the local development cluster.
 */
import pg from 'pg';
import { migrate } from '../src/db/migrate';

export const TEMPLATE = 'caishy_test_template';

export function adminUrl(): string {
  return process.env.TEST_DATABASE_URL ?? 'postgres://caishy:caishy-dev@127.0.0.1:5432/postgres';
}

export function urlFor(database: string): string {
  const u = new URL(adminUrl());
  u.pathname = `/${database}`;
  return u.toString();
}

/**
 * Drop a test database, waiting out an autovacuum worker that is in it for a moment: those run
 * as the superuser, and a role that isn't one (the local development cluster's) can't end them.
 */
export async function dropDatabase(admin: pg.Client, name: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await admin.query(`drop database if exists ${name} with (force)`);
      return;
    } catch (err) {
      if ((err as { code?: string }).code !== '42501' || attempt >= 50) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

export default async function setup() {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  // Databases left behind by interrupted runs. "_" is a LIKE wildcard, so escape it.
  const stale = await admin.query<{ datname: string }>(
    String.raw`select datname from pg_database where datname like 'caime\_t\_%'`,
  );
  for (const row of stale.rows)
    await admin.query(`drop database if exists ${row.datname} with (force)`).catch(() => {});
  await dropDatabase(admin, TEMPLATE);
  await admin.query(`create database ${TEMPLATE}`);
  await admin.end();
  const pool = new pg.Pool({ connectionString: urlFor(TEMPLATE), max: 1 });
  await migrate(pool);
  await pool.end();
}
