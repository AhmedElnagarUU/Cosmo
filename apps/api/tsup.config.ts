import { defineConfig } from 'tsup';

// Bundles the backend and its scripts. @cosmo/shared is TypeScript source, so it is bundled in.
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    'scripts/migrate': 'src/scripts/migrate.ts',
    'scripts/create-wholesaler': 'src/scripts/create-wholesaler.ts',
    'scripts/reset-owner-password': 'src/scripts/reset-owner-password.ts',
  },
  format: ['esm'],
  target: 'node22',
  clean: true,
  splitting: false,
  noExternal: ['@cosmo/shared'],
});
