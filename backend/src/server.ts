import mongoose from 'mongoose';
import { readConfig } from './config/env.js';
import { connectDatabase } from './lib/database.js';
import { User } from './models/User.js';
import { Task } from './models/Task.js';
import { createApp } from './app.js';

async function main() {
  const config = readConfig();
  await connectDatabase(config.MONGODB_URI);
  // Add missing indexes without dropping existing production indexes.
  await Promise.all([User.createIndexes(), Task.createIndexes()]);
  const { app, store, logger } = createApp(config);
  const server = app.listen(config.PORT, '0.0.0.0', () =>
    logger.info({ port: config.PORT }, 'TaskFlow API ready'),
  );
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timer = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      void Promise.all([store.close(), mongoose.disconnect()]).then(() => {
        clearTimeout(timer);
        process.exit(0);
      });
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(() => {
  console.error(
    'TaskFlow API failed to start. Check environment configuration and database access.',
  );
  process.exit(1);
});
