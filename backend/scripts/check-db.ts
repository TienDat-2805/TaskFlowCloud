import mongoose from 'mongoose';
import { readConfig } from '../src/config/env.js';
import { connectDatabase, databaseReady } from '../src/lib/database.js';
try {
  await connectDatabase(readConfig().MONGODB_URI);
  if (!(await databaseReady())) throw new Error('Database not ready');
  console.log('MongoDB connection and ping succeeded.');
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  const reason = /auth|bad credentials/i.test(message)
    ? 'Authentication failed: check Atlas database user/password.'
    : /querySrv|ENOTFOUND|ENODATA|ECONNREFUSED/i.test(message)
      ? 'DNS/network lookup failed: check cluster hostname and network access.'
      : /IP|whitelist|allowlist|server selection/i.test(message)
        ? 'Atlas access unavailable: check IP access list and network.'
        : 'Check URI, credentials, Atlas IP access list and network.';
  console.error('MongoDB connection failed. ' + reason);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
