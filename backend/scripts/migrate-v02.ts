import mongoose from 'mongoose';
import { readConfig } from '../src/config/env.js';
import { connectDatabase } from '../src/lib/database.js';
import { migrateV02 } from '../src/modules/tasks/migration.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Usage: npm run migrate:v02 -w backend -- [--dry-run] [--apply --confirm-database NAME --backup-confirmed] [--allow-remote]',
  );
} else {
  try {
    const allowed = new Set([
      '--dry-run',
      '--apply',
      '--confirm-database',
      '--backup-confirmed',
      '--allow-remote',
    ]);
    for (let i = 0; i < args.length; i++) {
      if (!allowed.has(args[i])) throw new Error('Unknown migration argument');
      if (args[i] === '--confirm-database') i++;
    }
    const apply = args.includes('--apply');
    if (apply && args.includes('--dry-run')) throw new Error('Choose either dry-run or apply');
    const target = args[args.indexOf('--confirm-database') + 1];
    const config = readConfig();
    const local = /^mongodb:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//.test(
      config.MONGODB_URI,
    );
    if (
      apply &&
      (!args.includes('--confirm-database') || !target || !args.includes('--backup-confirmed'))
    ) {
      throw new Error('Apply requires an exact database name and a confirmed backup.');
    }
    if (apply && !local && !args.includes('--allow-remote'))
      throw new Error('Remote apply requires --allow-remote.');
    await connectDatabase(config.MONGODB_URI);
    if (apply && target !== mongoose.connection.name)
      throw new Error('Database confirmation does not match target.');
    const report = await migrateV02({ apply });
    // Reports contain counts and document IDs only, never URI/user credentials or task text.
    console.log(JSON.stringify(report, null, 2));
  } catch {
    console.error(
      'Migration did not complete. Check arguments, backup confirmation, target access and data consistency; no credentials are printed.',
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
