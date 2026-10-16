import { Router } from 'express';
import { z } from 'zod';
import type { SortOrder } from 'mongoose';
import { Task, publicTask } from '../../models/Task.js';
import { requireAuth } from '../../middleware/auth.js';
import { ApiError } from '../../lib/errors.js';

const status = z.enum(['pending', 'completed']);
const fields = {
  title: z.string().trim().min(1, 'Vui lòng nhập tên công việc.').max(120, 'Tên tối đa 120 ký tự.'),
  description: z.string().max(2000, 'Mô tả tối đa 2000 ký tự.'),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  status,
};
const createSchema = z
  .object({
    ...fields,
    description: fields.description.default(''),
    dueAt: fields.dueAt.default(null),
    priority: fields.priority.default('medium'),
    status: status.default('pending'),
  })
  .strict();
const patchSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Cần ít nhất một trường cập nhật.');
const querySchema = z
  .object({
    status: z.enum(['all', 'pending', 'completed']).default('all'),
    search: z.string().trim().max(120).default(''),
    sort: z
      .enum(['createdAt_desc', 'dueAt_asc', 'dueAt_desc', 'title_asc'])
      .default('createdAt_desc'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID công việc không hợp lệ.');

export const taskRoutes = Router();
taskRoutes.use(requireAuth);

taskRoutes.get('/', async (req, res) => {
  const query = querySchema.parse(req.query);
  const filter = {
    userId: req.session.userId,
    ...(query.status !== 'all' ? { status: query.status } : {}),
    ...(query.search
      ? { title: { $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      : {}),
  };
  const sorts: Record<string, Record<string, SortOrder>> = {
    createdAt_desc: { createdAt: -1, _id: -1 },
    dueAt_asc: { dueAt: 1, _id: 1 },
    dueAt_desc: { dueAt: -1, _id: -1 },
    title_asc: { title: 1, _id: 1 },
  };
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort(sorts[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Task.countDocuments(filter),
  ]);
  res.json({
    data: tasks.map(publicTask),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
});

taskRoutes.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  const task = await Task.create({
    ...data,
    userId: req.session.userId,
    completedAt: data.status === 'completed' ? new Date() : null,
  });
  res.status(201).json({ data: publicTask(task) });
});

taskRoutes.get('/:id', async (req, res) => {
  const task = await Task.findOne({
    _id: idSchema.parse(req.params.id),
    userId: req.session.userId,
  });
  if (!task) throw new ApiError(404, 'TASK_NOT_FOUND', 'Không tìm thấy công việc.');
  res.json({ data: publicTask(task) });
});

taskRoutes.patch('/:id', async (req, res) => {
  const data = patchSchema.parse(req.body);
  const filter = { _id: idSchema.parse(req.params.id), userId: req.session.userId };
  // Atomic update preserves completedAt when a completed task is edited or completed twice.
  const task = await Task.findOneAndUpdate(
    filter,
    [
      {
        $set: {
          ...Object.fromEntries(
            Object.entries(data)
              .filter(([key]) => key !== 'dueAt')
              .map(([key, value]) => [key, { $literal: value }]),
          ),
          ...(data.dueAt !== undefined
            ? { dueAt: { $literal: data.dueAt === null ? null : new Date(data.dueAt) } }
            : {}),
          ...(data.status !== undefined
            ? {
                completedAt:
                  data.status === 'completed' ? { $ifNull: ['$completedAt', '$$NOW'] } : null,
              }
            : {}),
        },
      },
    ],
    { new: true },
  );
  if (!task) throw new ApiError(404, 'TASK_NOT_FOUND', 'Không tìm thấy công việc.');
  res.json({ data: publicTask(task) });
});

taskRoutes.delete('/:id', async (req, res) => {
  const task = await Task.findOneAndDelete({
    _id: idSchema.parse(req.params.id),
    userId: req.session.userId,
  });
  if (!task) throw new ApiError(404, 'TASK_NOT_FOUND', 'Không tìm thấy công việc.');
  res.status(204).end();
});
