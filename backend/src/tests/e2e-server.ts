import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createServer } from 'vite';
import { createApp } from '../app.js';
import { connectDatabase } from '../lib/database.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';

// The browser suite always uses a disposable database; .env and Atlas are never used.
process.env.MONGOMS_DOWNLOAD_DIR = resolve('.cache/mongodb-binaries');
const mongo = await MongoMemoryServer.create({ instance: { dbName: 'taskflow_browser_test' } });
await connectDatabase(mongo.getUri());
await Promise.all([User.createIndexes(), Task.createIndexes()]);
const runtime = createApp({
  NODE_ENV: 'test',
  PORT: 4011,
  MONGODB_URI: mongo.getUri(),
  SESSION_SECRET: randomBytes(48).toString('hex'),
  COOKIE_SECURE: false,
  CLIENT_ORIGIN: 'http://localhost:5174',
  TRUST_PROXY: 0,
  LOG_LEVEL: 'silent',
  TASKFLOW_V02_ENABLED: true,
  REQUIRE_TASK_REVISION: true,
});
const server = runtime.app.listen(4011, '127.0.0.1');
const vite = await createServer({
  root: resolve('frontend'),
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4011' },
      '/health': { target: 'http://127.0.0.1:4011' },
    },
  },
});
await vite.listen();
console.log('Isolated browser test environment ready at http://localhost:5174');
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await vite.close();
  await new Promise<void>((done) => server.close(() => done()));
  await runtime.store.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(0);
}
process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
