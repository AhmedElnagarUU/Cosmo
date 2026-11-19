import { parseArgs } from 'node:util';
import { createDb } from '../core/db';
import { resetOwnerPassword } from '../modules/platform/platform.service';

// C-87: used by the platform team after calling the owner to check who they are.
// pnpm --filter @cosmo/api platform:reset-owner-password --login-code ahmed-pharma --owner-phone 01012345678
const { values } = parseArgs({
  options: { 'login-code': { type: 'string' }, 'owner-phone': { type: 'string' } },
});

const url = process.env.MIGRATION_DATABASE_URL;
if (!url || !values['login-code'] || !values['owner-phone']) {
  console.error('Usage: --login-code <code> --owner-phone <phone>, with MIGRATION_DATABASE_URL set');
  process.exit(1);
}

const db = createDb(url);
resetOwnerPassword(db, values['login-code'], values['owner-phone'])
  .then((r) => console.log(`Temporary password (shown once): ${r.temporaryPassword}`))
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
