import mongoose from 'mongoose';
import { dueSchema, normalizeDue } from './deadline.js';
import { Task } from '../../models/Task.js';

const defaults = {
  revision: 0,
  startedAt: null,
  deletedAt: null,
  purgeAt: null,
  deletedBy: null,
  activity: [],
  dueDate: null,
  dueTimeZone: null,
};
const fields = [...Object.keys(defaults), 'dueMode'];
export async function migrationReport() {
  if (!mongoose.connection.db) throw new Error('Database is not connected');
  const collection = mongoose.connection.db.collection('tasks');
  const missing = { $or: fields.map((name) => ({ [name]: { $exists: false } })) };
  const anomalies: { id: string; reasons: string[] }[] = [];
  for await (const task of collection.find({})) {
    const reasons: string[] = [];
    if (!['pending', 'in_progress', 'completed'].includes(task.status))
      reasons.push('invalid_status');
    if ((task.status === 'completed') !== task.completedAt instanceof Date)
      reasons.push('completedAt_status_mismatch');
    if (task.status !== 'completed' && task.completedAt != null)
      reasons.push('invalid_completedAt');
    if (task.dueAt != null && !(task.dueAt instanceof Date)) reasons.push('invalid_dueAt');
    if (task.startedAt != null && !(task.startedAt instanceof Date))
      reasons.push('invalid_startedAt');
    if (task.status === 'in_progress' && !(task.startedAt instanceof Date))
      reasons.push('missing_startedAt');
    if (task.revision !== undefined && (!Number.isSafeInteger(task.revision) || task.revision < 0))
      reasons.push('invalid_revision');
    if (task.activity !== undefined && !Array.isArray(task.activity))
      reasons.push('invalid_activity');
    if (task.deletedAt != null && !(task.deletedAt instanceof Date))
      reasons.push('invalid_deletedAt');
    if (task.deletedAt == null && task.purgeAt != null) reasons.push('active_task_has_purgeAt');
    if (task.deletedAt != null && !(task.purgeAt instanceof Date))
      reasons.push('deleted_task_missing_purgeAt');
    if (task.dueMode !== undefined) {
      if (!['none', 'date', 'datetime'].includes(task.dueMode)) reasons.push('invalid_dueMode');
      else if ((task.dueMode === 'none') !== (task.dueAt == null))
        reasons.push('dueMode_timestamp_mismatch');
      if (task.dueMode === 'date') {
        const parsed = dueSchema.safeParse({
          mode: 'date',
          date: task.dueDate,
          timeZone: task.dueTimeZone,
        });
        if (!parsed.success || normalizeDue(parsed.data).dueAt?.getTime() !== task.dueAt?.getTime())
          reasons.push('invalid_date_only_metadata');
      }
    }
    if (reasons.length) anomalies.push({ id: String(task._id), reasons });
  }
  return {
    database: mongoose.connection.name,
    users: await mongoose.connection.db.collection('users').countDocuments({}),
    tasks: await collection.countDocuments({}),
    wouldModify: await collection.countDocuments(missing),
    anomalies,
  };
}
export async function migrateV02(options: { apply?: boolean; installTtl?: boolean } = {}) {
  const before = await migrationReport();
  if (!options.apply)
    return {
      mode: 'dry-run' as const,
      before,
      modifiedCount: 0,
      after: before,
      ttlInstalled: false,
    };
  if (before.anomalies.length)
    throw new Error('Migration blocked: review inconsistent documents before applying.');
  const whenMissing = (field: string, value: unknown) => ({
    $cond: [{ $eq: [{ $type: '$' + field }, 'missing'] }, { $literal: value }, '$' + field],
  });
  const set: Record<string, unknown> = Object.fromEntries(
    Object.entries(defaults).map(([field, value]) => [field, whenMissing(field, value)]),
  );
  set.dueMode = {
    $cond: [
      { $eq: [{ $type: '$dueMode' }, 'missing'] },
      { $cond: [{ $eq: [{ $ifNull: ['$dueAt', null] }, null] }, 'none', 'datetime'] },
      '$dueMode',
    ],
  };
  const update = await Task.collection.updateMany(
    {
      $or: fields.map((name) => ({ [name]: { $exists: false } })),
    },
    [{ $set: set }],
  );
  const after = await migrationReport();
  if (after.anomalies.length)
    throw new Error('Post-migration validation failed; TTL was not installed.');
  await Task.createIndexes();
  if (options.installTtl !== false) {
    await Task.collection.createIndex(
      { purgeAt: 1 },
      {
        name: 'tasks_purge_ttl_v02',
        expireAfterSeconds: 0,
        partialFilterExpression: { deletedAt: { $type: 'date' } },
      },
    );
  }
  return {
    mode: 'apply' as const,
    before,
    after,
    modifiedCount: update.modifiedCount,
    ttlInstalled: options.installTtl !== false,
  };
}
