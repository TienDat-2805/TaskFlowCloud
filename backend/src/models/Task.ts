import { Schema, model, type Types } from 'mongoose';
import { dueBucket, type DueMode } from '../modules/tasks/deadline.js';

export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export type ActivityType =
  | 'created'
  | 'started'
  | 'status_changed'
  | 'deadline_changed'
  | 'priority_changed'
  | 'title_changed'
  | 'deleted'
  | 'restored';
export interface TaskActivity {
  eventId: string;
  at: Date;
  type: ActivityType;
  from?: string | null;
  to?: string | null;
  revision: number;
}
export interface TaskRecord {
  userId: Types.ObjectId;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  completedAt: Date | null;
  dueMode?: DueMode;
  dueDate?: string | null;
  dueTimeZone?: string | null;
  startedAt?: Date | null;
  deletedAt?: Date | null;
  purgeAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  revision?: number;
  activity?: TaskActivity[];
  createdAt: Date;
  updatedAt: Date;
}
const activitySchema = new Schema<TaskActivity>(
  {
    eventId: { type: String, required: true },
    at: { type: Date, required: true },
    type: {
      type: String,
      enum: [
        'created',
        'started',
        'status_changed',
        'deadline_changed',
        'priority_changed',
        'title_changed',
        'deleted',
        'restored',
      ],
      required: true,
    },
    from: { type: String, default: null, maxlength: 300 },
    to: { type: String, default: null, maxlength: 300 },
    revision: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);
const schema = new Schema<TaskRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
      required: true,
    },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', required: true },
    dueAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    dueMode: { type: String, enum: ['none', 'date', 'datetime'], default: 'none' },
    dueDate: { type: String, default: null },
    dueTimeZone: { type: String, default: null },
    startedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    purgeAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, default: null },
    revision: { type: Number, default: 0, min: 0 },
    activity: { type: [activitySchema], default: [] },
  },
  { timestamps: true },
);
schema.index({ userId: 1, status: 1, dueAt: 1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, deletedAt: 1, status: 1, dueAt: 1 });
schema.index({ userId: 1, deletedAt: 1, priority: 1, createdAt: -1 });
schema.index({ userId: 1, deletedAt: 1, createdAt: -1 });
// TTL is installed by the explicitly applied migration after data validation.
export const Task = model<TaskRecord>('Task', schema);
export type StoredTask = TaskRecord & { _id: Types.ObjectId };
export function publicTask(
  task: StoredTask,
  now = new Date(),
  timeZone = 'UTC',
  includeActivity = false,
) {
  const dueMode = task.dueMode ?? (task.dueAt ? 'datetime' : 'none');
  const bucket = dueBucket(task, now, timeZone);
  return {
    id: String(task._id),
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    startedAt: task.startedAt ?? null,
    dueMode,
    dueDate: task.dueDate ?? null,
    dueTimeZone: task.dueTimeZone ?? null,
    revision: task.revision ?? 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    isOverdue: bucket === 'overdue',
    dueBucket: bucket,
    ...(task.deletedAt ? { deletedAt: task.deletedAt, purgeAt: task.purgeAt ?? null } : {}),
    ...(includeActivity ? { activity: [...(task.activity ?? [])].reverse() } : {}),
  };
}
