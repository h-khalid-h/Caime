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

export default async function setup() {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  // Databases left behind by interrupted runs. "_" is a LIKE wildcard, so escape it.
  const stale = await admin.query<{ datname: string }>(
    String.raw`select datname from pg_database where datname like 'caishy\_t\_%'`,
  );
  for (const row of stale.rows)
    await admin.query(`drop database if exists ${row.datname} with (force)`).catch(() => {});
  await admin.query(`drop database if exists ${TEMPLATE} with (force)`);
  await admin.query(`create database ${TEMPLATE}`);
  await admin.end();
  const pool = new pg.Pool({ connectionString: urlFor(TEMPLATE), max: 1 });
  await migrate(pool);
  await pool.end();
}
