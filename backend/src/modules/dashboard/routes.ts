import { Router } from 'express';
import { Types } from 'mongoose';
import { Task, publicTask } from '../../models/Task.js';
import { requireAuth } from '../../middleware/auth.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth);
dashboardRoutes.get('/summary', async (req, res) => {
  const now = new Date();
  const owner = { userId: new Types.ObjectId(req.session.userId) };
  const [counts, upcoming] = await Promise.all([
    Task.aggregate<{ total: number; completed: number; pending: number; overdue: number }>([
      { $match: owner },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'pending'] },
                    { $ne: ['$dueAt', null] },
                    { $lt: ['$dueAt', now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    Task.find({ ...owner, status: 'pending', dueAt: { $ne: null } })
      .sort({ dueAt: 1, _id: 1 })
      .limit(5),
  ]);
  const { total = 0, completed = 0, pending = 0, overdue = 0 } = counts[0] ?? {};
  res.json({
    data: {
      total,
      completed,
      pending,
      overdue,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      upcoming: upcoming.map(publicTask),
    },
  });
});
