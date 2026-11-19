import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://cosmo_app:cosmo_app@localhost:5432/cosmo_test',
      MIGRATION_DATABASE_URL:
        process.env.TEST_MIGRATION_DATABASE_URL ?? 'postgres://cosmo_owner:cosmo_owner@localhost:5432/cosmo_test',
      WEB_ORIGIN: 'http://localhost:3000',
    },
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
