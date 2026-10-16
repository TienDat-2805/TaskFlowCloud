import { Schema, model } from 'mongoose';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending', required: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', required: true },
    dueAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index({ userId: 1, status: 1, dueAt: 1 });
schema.index({ userId: 1, createdAt: -1 });

export const Task = model('Task', schema);
export function publicTask(task: InstanceType<typeof Task>) {
  return {
    id: String(task._id),
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    isOverdue: task.status === 'pending' && !!task.dueAt && task.dueAt.getTime() < Date.now(),
  };
}
