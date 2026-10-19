import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Task, publicTask, type StoredTask } from '../../models/Task.js';
import { requireAuth } from '../../middleware/auth.js';
import { dayBounds, timeZoneSchema } from '../tasks/deadline.js';
import { taskSortStages } from '../tasks/query.js';

interface Counts {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  dueToday: number;
  upcomingCount: number;
  withoutDeadline: number;
}
interface Result {
  counts: Counts[];
  attention: StoredTask[];
  upcoming: StoredTask[];
  today: StoredTask[];
  overdueTasks: StoredTask[];
}
export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth);
dashboardRoutes.get('/summary', async (req, res) => {
  const { timeZone } = z
    .object({ timeZone: timeZoneSchema.default('UTC') })
    .strict()
    .parse(req.query);
  const now = new Date();
  const { tomorrow, upcomingEnd } = dayBounds(now, timeZone);
  const active = { $in: ['$status', ['pending', 'in_progress']] };
  const hasDue = { $ne: [{ $ifNull: ['$dueAt', null] }, null] };
  const count = (condition: object) => ({ $sum: { $cond: [condition, 1, 0] } });
  const unfinished = { status: { $in: ['pending', 'in_progress'] } };
  const [result] = await Task.aggregate<Result>([
    { $match: { userId: new Types.ObjectId(req.session.userId), deletedAt: null } },
    {
      $facet: {
        counts: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              pending: count({ $eq: ['$status', 'pending'] }),
              inProgress: count({ $eq: ['$status', 'in_progress'] }),
              completed: count({ $eq: ['$status', 'completed'] }),
              overdue: count({ $and: [active, hasDue, { $lt: ['$dueAt', now] }] }),
              dueToday: count({
                $and: [active, hasDue, { $gte: ['$dueAt', now] }, { $lt: ['$dueAt', tomorrow] }],
              }),
              upcomingCount: count({
                $and: [
                  active,
                  hasDue,
                  { $gte: ['$dueAt', tomorrow] },
                  { $lt: ['$dueAt', upcomingEnd] },
                ],
              }),
              withoutDeadline: count({
                $and: [active, { $eq: [{ $ifNull: ['$dueAt', null] }, null] }],
              }),
            },
          },
        ],
        attention: [
          { $match: unfinished },
          ...taskSortStages('attention', now, timeZone),
          { $limit: 5 },
          { $project: { activity: 0 } },
        ],
        upcoming: [
          { $match: { ...unfinished, dueAt: { $gte: tomorrow, $lt: upcomingEnd } } },
          { $sort: { dueAt: 1, createdAt: 1, _id: 1 } },
          { $limit: 5 },
          { $project: { activity: 0 } },
        ],
        today: [
          { $match: { ...unfinished, dueAt: { $gte: now, $lt: tomorrow } } },
          { $sort: { dueAt: 1, createdAt: 1, _id: 1 } },
          { $limit: 5 },
          { $project: { activity: 0 } },
        ],
        overdueTasks: [
          { $match: { ...unfinished, dueAt: { $ne: null, $lt: now } } },
          { $sort: { dueAt: 1, createdAt: 1, _id: 1 } },
          { $limit: 5 },
          { $project: { activity: 0 } },
        ],
      },
    },
  ]);
  const counts = result?.counts[0] ?? {
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    dueToday: 0,
    upcomingCount: 0,
    withoutDeadline: 0,
  };
  const {
    total,
    pending,
    inProgress,
    completed,
    overdue,
    dueToday,
    upcomingCount,
    withoutDeadline,
  } = counts;
  const view = (task: StoredTask) => publicTask(task, now, timeZone);
  res.json({
    data: {
      total,
      pending,
      inProgress,
      completed,
      remaining: pending + inProgress,
      overdue,
      dueToday,
      upcomingCount,
      withoutDeadline,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      attention: (result?.attention ?? []).map(view),
      upcoming: (result?.upcoming ?? []).map(view),
      today: (result?.today ?? []).map(view),
      overdueTasks: (result?.overdueTasks ?? []).map(view),
    },
  });
});
