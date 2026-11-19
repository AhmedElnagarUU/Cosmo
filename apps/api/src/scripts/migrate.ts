import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Runs the numbered SQL files in apps/api/migrations in order, each in its own transaction.
// Connects as the owner of the tables (MIGRATION_DATABASE_URL), not as the app user.

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, '..', '..', 'migrations');

export async function migrate(connectionString: string, log = console.log): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const role = await client.query(`select 1 from pg_roles where rolname = 'cosmo_app'`);
    if (role.rowCount === 0) {
      throw new Error('The database role cosmo_app does not exist. Create it first (see apps/api/db-init/01-roles.sql)');
    }
    await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const text = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(text);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
        log(`Applied ${file}`);
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error('Missing environment variable MIGRATION_DATABASE_URL');
    process.exit(1);
  }
  migrate(url)
    .then(() => console.log('Database is up to date'))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
