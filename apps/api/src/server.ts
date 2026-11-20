import { config } from './core/config';
import { createDb } from './core/db';
import { createApp } from './app';
import { scheduleExpiryJob } from './jobs/expiry';
import { scheduleWaitingOrdersJob } from './jobs/waiting-orders';

const db = createDb(config.databaseUrl);
const app = createApp(db);

const server = app.listen(config.port, () => {
  console.log(`Cosmo API listening on port ${config.port}`);
});

const expiryTimer = scheduleExpiryJob(db);
const waitingTimer = scheduleWaitingOrdersJob(db);

async function shutdown() {
  clearInterval(expiryTimer);
  clearInterval(waitingTimer);
  server.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
