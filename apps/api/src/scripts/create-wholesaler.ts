import { parseArgs } from 'node:util';
import { createDb } from '../core/db';
import { createWholesaler } from '../modules/platform/platform.service';

// pnpm --filter @cosmo/api platform:create-wholesaler --name "Ahmed Pharma" --login-code ahmed-pharma --owner-name "Ahmed" --owner-phone 01012345678
const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    'login-code': { type: 'string' },
    'owner-name': { type: 'string' },
    'owner-phone': { type: 'string' },
  },
});

const url = process.env.MIGRATION_DATABASE_URL;
if (!url || !values.name || !values['login-code'] || !values['owner-name'] || !values['owner-phone']) {
  console.error('Usage: --name <name> --login-code <code> --owner-name <name> --owner-phone <phone>, with MIGRATION_DATABASE_URL set');
  process.exit(1);
}

const db = createDb(url);
createWholesaler(db, {
  name: values.name,
  loginCode: values['login-code'],
  ownerName: values['owner-name'],
  ownerPhone: values['owner-phone'],
})
  .then((r) => {
    console.log('Wholesaler created.');
    console.log(`Login link code: ${r.loginCode}`);
    console.log(`Owner phone:     ${r.ownerPhone}`);
    console.log(`Temporary password (shown once, must be changed at first login): ${r.temporaryPassword}`);
  })
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
