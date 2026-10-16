import mongoose from 'mongoose';
import { readConfig } from '../src/config/env.js';
import { connectDatabase } from '../src/lib/database.js';
import { User } from '../src/models/User.js';
import { Task } from '../src/models/Task.js';

try {
  await connectDatabase(readConfig().MONGODB_URI);
  await Promise.all([User.createIndexes(), Task.createIndexes()]);
  console.log('TaskFlow indexes created (existing indexes preserved).');
} catch {
  console.error('Index setup failed. Check configuration and database permissions.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
