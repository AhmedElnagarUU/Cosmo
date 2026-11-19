import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { Database } from './schema';

// numeric comes back as text, so money is never turned into an inexact number
pg.types.setTypeParser(1700, (v) => v);
// date comes back as "2026-11-19", not as a JavaScript Date at midnight
pg.types.setTypeParser(1082, (v) => v);

export type Db = Kysely<Database>;
export type Trx = Transaction<Database>;

export function createDb(connectionString: string): Db {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 10 }) }),
  });
}

// Runs fn in one transaction, with row level security set to this wholesaler
// (docs/technical/04-security.md, lock 2). Everything inside is saved together or not at all.
export async function withTenant<T>(
  db: Db,
  wholesalerId: string,
  fn: (trx: Trx) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.wholesaler_id', ${wholesalerId}, true)`.execute(trx);
    return fn(trx);
  });
}
