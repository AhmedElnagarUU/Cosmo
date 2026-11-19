import { config } from './core/config';
import { createDb } from './core/db';
import { createApp } from './app';

const db = createDb(config.databaseUrl);
const app = createApp(db);

const server = app.listen(config.port, () => {
  console.log(`Cosmo API listening on port ${config.port}`);
});

async function shutdown() {
  server.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
