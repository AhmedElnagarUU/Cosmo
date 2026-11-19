import pg from 'pg';
import { migrate } from '../src/scripts/migrate';

// Starts every test run from an empty test database with all migrations applied.
export default async function setup() {
  const url =
    process.env.TEST_MIGRATION_DATABASE_URL ?? 'postgres://cosmo_owner:cosmo_owner@localhost:5432/cosmo_test';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('drop schema public cascade');
  await client.query('create schema public');
  await client.query('grant usage on schema public to cosmo_app');
  await client.end();
  await migrate(url, () => {});
}
