import { Router } from 'express';
import { z, ZodError } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { Task, publicTask, type StoredTask } from '../../models/Task.js';
import { requireAuth } from '../../middleware/auth.js';
import { ApiError } from '../../lib/errors.js';
import { legacyDue, normalizeDue, timeZoneSchema } from './deadline.js';
import { taskFilter, taskSortStages } from './query.js';
import {
  activity,
  checkRevision,
  conflict,
  ownedTask,
  patchTask,
  restoreTask,
  revisionFilter,
  softDelete,
} from './service.js';
import {
  createTaskSchema,
  expectedRevision,
  idSchema,
  listSchema,
  paginationFields,
  patchTaskSchema,
  revisionBodySchema,
} from './validation.js';

export function taskRoutes(config: AppConfig) {
  const router = Router();
  const enabled = config.TASKFLOW_V02_ENABLED ?? false;
  const requireRevision = config.REQUIRE_TASK_REVISION ?? false;
  const requireWorkflow = () => {
    if (!enabled) throw new ApiError(404, 'FEATURE_DISABLED', 'Tính năng chưa được bật.');
  };
  const validateStatus = (status: string | undefined) => {
    if (status === 'in_progress' && !enabled)
      throw new ZodError([
        { code: 'custom', path: ['status'], message: 'Trạng thái đang làm chưa được bật.' },
      ]);
  };
  router.use(requireAuth);
  router.get('/trash', async (req, res) => {
    requireWorkflow();
    const query = z
      .object({ ...paginationFields, timeZone: timeZoneSchema.default('UTC') })
      .strict()
      .parse(req.query);
    const now = new Date();
    const filter = { userId: req.session.userId, deletedAt: { $ne: null } };
    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .select('-activity')
        .sort({ deletedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Task.countDocuments(filter),
    ]);
    res.json({
      data: tasks.map((task) => publicTask(task, now, query.timeZone)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  });
  router.get('/trash/:id', async (req, res) => {
    requireWorkflow();
    const task = await ownedTask(idSchema.parse(req.params.id), req.session.userId!, true);
    res
      .set('ETag', '"v' + (task.revision ?? 0) + '"')
      .json({ data: publicTask(task, new Date(), 'UTC', true) });
  });
  router.get('/', async (req, res) => {
    const query = listSchema.parse(req.query);
    const now = new Date();
    const filter = taskFilter(req.session.userId!, query, now);
    const [tasks, total] = await Promise.all([
      Task.aggregate<StoredTask>([
        { $match: filter },
        ...taskSortStages(query.sort, now, query.timeZone),
        { $skip: (query.page - 1) * query.limit },
        { $limit: query.limit },
        { $project: { activity: 0 } },
      ]),
      Task.countDocuments(filter),
    ]);
    res.json({
      data: tasks.map((task) => publicTask(task, now, query.timeZone)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  });
  router.post('/', async (req, res) => {
    const data = createTaskSchema.parse(req.body);
    validateStatus(data.status);
    const now = new Date();
    const due = data.due ? normalizeDue(data.due) : legacyDue(data.dueAt ?? null);
    const task = await Task.create({
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      userId: req.session.userId,
      ...due,
      startedAt: data.status === 'in_progress' ? now : null,
      completedAt: data.status === 'completed' ? now : null,
      revision: 0,
      activity: [activity('created', now, 0, null, data.status)],
      createdAt: now,
      updatedAt: now,
    });
    res
      .status(201)
      .set('ETag', '"v0"')
      .json({ data: publicTask(task.toObject(), now) });
  });
  router.get('/:id/activity', async (req, res) => {
    requireWorkflow();
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
      .strict()
      .parse(req.query);
    const task = await ownedTask(idSchema.parse(req.params.id), req.session.userId!);
    res.json({ data: [...(task.activity ?? [])].reverse().slice(0, query.limit) });
  });
  router.get('/:id', async (req, res) => {
    const task = await ownedTask(idSchema.parse(req.params.id), req.session.userId!);
    res
      .set('ETag', '"v' + (task.revision ?? 0) + '"')
      .json({ data: publicTask(task, new Date(), 'UTC', true) });
  });
  router.patch('/:id', async (req, res) => {
    const data = patchTaskSchema.parse(req.body);
    validateStatus(data.status);
    const expected = expectedRevision(req, data.expectedRevision, requireRevision);
    const task = await ownedTask(idSchema.parse(req.params.id), req.session.userId!);
    checkRevision(task, expected);
    const now = new Date();
    const updated = await patchTask(task, data, now);
    res.set('ETag', '"v' + (updated.revision ?? 0) + '"').json({ data: publicTask(updated, now) });
  });
  router.post('/:id/restore', async (req, res) => {
    requireWorkflow();
    const data = revisionBodySchema.parse(req.body ?? {});
    const expected = expectedRevision(req, data.expectedRevision, requireRevision);
    const task = await ownedTask(idSchema.parse(req.params.id), req.session.userId!, true);
    checkRevision(task, expected);
    const now = new Date();
    const updated = await restoreTask(task, now);
    res.set('ETag', '"v' + (updated.revision ?? 0) + '"').json({ data: publicTask(updated, now) });
  });
  router.delete('/:id/permanent', async (req, res) => {
    requireWorkflow();
    const data = revisionBodySchema.parse(req.body ?? {});
    const expected = expectedRevision(req, data.expectedRevision, requireRevision);
    const task = await ownedTask(idSchema.parse(req.params.id), req.session.userId!, true);
    checkRevision(task, expected);
    const deleted = await Task.deleteOne({
      _id: task._id,
      userId: task.userId,
      deletedAt: { $ne: null },
      ...revisionFilter(task),
    });
    if (!deleted.deletedCount) throw conflict();
    res.status(204).end();
  });
  router.delete('/:id', async (req, res) => {
    const data = revisionBodySchema.parse(req.body ?? {});
    const expected = expectedRevision(req, data.expectedRevision, requireRevision);
    const task = await ownedTask(idSchema.parse(req.params.id), req.session.userId!);
    checkRevision(task, expected);
    if (enabled) {
      const deleted = await softDelete(task, new Date());
      res.set('ETag', '"v' + deleted.revision + '"');
    } else {
      const deleted = await Task.deleteOne({
        _id: task._id,
        userId: task.userId,
        deletedAt: null,
        ...revisionFilter(task),
      });
      if (!deleted.deletedCount) throw conflict();
    }
    res.status(204).end();
  });
  return router;
}
