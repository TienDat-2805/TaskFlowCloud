import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';
import { Task, type StoredTask, type TaskActivity, type ActivityType } from '../../models/Task.js';
import { legacyDue, normalizeDue, type DueFields } from './deadline.js';
import type { TaskPatch } from './validation.js';

export const conflict = () =>
  new ApiError(409, 'TASK_CONFLICT', 'Công việc đã được cập nhật ở nơi khác, hãy tải lại.');
export const notFound = () => new ApiError(404, 'TASK_NOT_FOUND', 'Không tìm thấy công việc.');
export function checkRevision(task: StoredTask, expected: number | undefined) {
  if (expected !== undefined && expected !== (task.revision ?? 0)) throw conflict();
}
export function revisionFilter(task: StoredTask) {
  return (task.revision ?? 0) === 0
    ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
    : { revision: task.revision };
}
export function activity(
  type: ActivityType,
  at: Date,
  revision: number,
  from: string | null,
  to: string | null,
): TaskActivity {
  return { eventId: randomUUID(), at, type, from, to, revision };
}
export async function ownedTask(id: string, userId: string, trash = false) {
  const task = await Task.findOne({
    _id: id,
    userId,
    deletedAt: trash ? { $ne: null } : null,
  }).lean();
  if (!task) throw notFound();
  return task;
}
function currentDue(task: StoredTask): DueFields {
  return {
    dueAt: task.dueAt,
    dueMode: task.dueMode ?? (task.dueAt ? 'datetime' : 'none'),
    dueDate: task.dueDate ?? null,
    dueTimeZone: task.dueTimeZone ?? null,
  };
}
const summarizeDue = (value: DueFields) =>
  value.dueMode === 'date'
    ? value.dueDate + ' (' + value.dueTimeZone + ')'
    : (value.dueAt?.toISOString() ?? null);

export async function patchTask(task: StoredTask, values: TaskPatch, now: Date) {
  const revision = (task.revision ?? 0) + 1;
  const changes: Record<string, unknown> = {};
  const events: TaskActivity[] = [];
  for (const field of ['title', 'description', 'priority'] as const) {
    if (values[field] !== undefined && values[field] !== task[field]) {
      changes[field] = values[field];
      if (field !== 'description')
        events.push(
          activity(
            field === 'title' ? 'title_changed' : 'priority_changed',
            now,
            revision,
            task[field],
            values[field],
          ),
        );
    }
  }
  if (values.status !== undefined && values.status !== task.status) {
    changes.status = values.status;
    changes.completedAt = values.status === 'completed' ? now : null;
    const starts = values.status === 'in_progress' && !task.startedAt;
    if (starts) changes.startedAt = now;
    events.push(
      activity(starts ? 'started' : 'status_changed', now, revision, task.status, values.status),
    );
  }
  const due =
    values.due !== undefined
      ? normalizeDue(values.due)
      : values.dueAt !== undefined
        ? legacyDue(values.dueAt)
        : undefined;
  if (due && JSON.stringify(due) !== JSON.stringify(currentDue(task))) {
    Object.assign(changes, due);
    events.push(
      activity(
        'deadline_changed',
        now,
        revision,
        summarizeDue(currentDue(task)),
        summarizeDue(due),
      ),
    );
  }
  if (!Object.keys(changes).length) return task;
  const updated = await Task.findOneAndUpdate(
    {
      _id: task._id,
      userId: task.userId,
      deletedAt: null,
      ...revisionFilter(task),
    },
    {
      $set: { ...changes, revision, updatedAt: now },
      ...(events.length ? { $push: { activity: { $each: events, $slice: -100 } } } : {}),
    },
    { new: true, runValidators: true, timestamps: false },
  ).lean();
  if (!updated) throw conflict();
  return updated;
}
export async function softDelete(task: StoredTask, now: Date) {
  const revision = (task.revision ?? 0) + 1;
  const updated = await Task.findOneAndUpdate(
    {
      _id: task._id,
      userId: task.userId,
      deletedAt: null,
      ...revisionFilter(task),
    },
    {
      $set: {
        deletedAt: now,
        purgeAt: new Date(now.getTime() + 30 * 86_400_000),
        deletedBy: task.userId,
        revision,
        updatedAt: now,
      },
      $push: {
        activity: { $each: [activity('deleted', now, revision, null, 'trash')], $slice: -100 },
      },
    },
    { new: true, timestamps: false },
  ).lean();
  if (!updated) throw conflict();
  return updated;
}
export async function restoreTask(task: StoredTask, now: Date) {
  if (!task.purgeAt || task.purgeAt <= now)
    throw new ApiError(404, 'TRASH_EXPIRED', 'Công việc đã hết thời hạn khôi phục.');
  const revision = (task.revision ?? 0) + 1;
  const updated = await Task.findOneAndUpdate(
    {
      _id: task._id,
      userId: task.userId,
      deletedAt: { $ne: null },
      purgeAt: { $gt: now },
      ...revisionFilter(task),
    },
    {
      $set: { deletedAt: null, deletedBy: null, revision, updatedAt: now },
      $unset: { purgeAt: '' },
      $push: {
        activity: { $each: [activity('restored', now, revision, 'trash', null)], $slice: -100 },
      },
    },
    { new: true, timestamps: false },
  ).lean();
  if (!updated) throw conflict();
  return updated;
}
