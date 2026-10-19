import type { PipelineStage } from 'mongoose';
import { Types } from 'mongoose';
import type { TaskQuery } from './validation.js';
import { dayBounds } from './deadline.js';

export function taskFilter(userId: string, query: TaskQuery, now: Date) {
  const conditions: Record<string, unknown>[] = [
    { userId: new Types.ObjectId(userId), deletedAt: null },
  ];
  if (query.status !== 'all')
    conditions.push({
      status: query.status === 'active' ? { $in: ['pending', 'in_progress'] } : query.status,
    });
  if (query.priority !== 'all') conditions.push({ priority: query.priority });
  if (query.search)
    conditions.push({
      title: { $regex: query.search.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&'), $options: 'i' },
    });
  const bounds = dayBounds(now, query.timeZone);
  if (query.due !== 'all') {
    conditions.push({ status: { $in: ['pending', 'in_progress'] } });
    if (query.due === 'no_due') conditions.push({ dueAt: null });
    if (query.due === 'overdue') conditions.push({ dueAt: { $ne: null, $lt: now } });
    if (query.due === 'today') conditions.push({ dueAt: { $gte: now, $lt: bounds.tomorrow } });
    if (query.due === 'upcoming')
      conditions.push({ dueAt: { $gte: bounds.tomorrow, $lt: bounds.upcomingEnd } });
  }
  return { $and: conditions };
}
export function taskSortStages(
  sort: TaskQuery['sort'],
  now: Date,
  timeZone: string,
): (PipelineStage.Sort | PipelineStage.Set)[] {
  if (sort === 'createdAt_desc') return [{ $sort: { createdAt: -1, _id: -1 } }];
  if (sort === 'title_asc') return [{ $sort: { title: 1, _id: 1 } }];
  const fields = {
    _priorityRank: {
      $switch: {
        branches: [
          { case: { $eq: ['$priority', 'high'] }, then: 0 },
          { case: { $eq: ['$priority', 'medium'] }, then: 1 },
        ],
        default: 2,
      },
    },
    _noDue: { $cond: [{ $eq: [{ $ifNull: ['$dueAt', null] }, null] }, 1, 0] },
  };
  if (sort === 'dueAt_asc' || sort === 'dueAt_desc')
    return [
      { $set: { _noDue: fields._noDue } },
      { $sort: { _noDue: 1, dueAt: sort === 'dueAt_asc' ? 1 : -1, createdAt: 1, _id: 1 } },
    ];
  if (sort === 'priority_desc')
    return [
      { $set: fields },
      { $sort: { _priorityRank: 1, _noDue: 1, dueAt: 1, createdAt: 1, _id: 1 } },
    ];
  const { tomorrow } = dayBounds(now, timeZone);
  return [
    {
      $set: {
        ...fields,
        _attentionRank: {
          $switch: {
            branches: [
              {
                case: {
                  $and: [
                    { $ne: ['$status', 'completed'] },
                    { $ne: [{ $ifNull: ['$dueAt', null] }, null] },
                    { $lt: ['$dueAt', now] },
                  ],
                },
                then: 0,
              },
              {
                case: {
                  $and: [
                    { $ne: ['$status', 'completed'] },
                    { $gte: ['$dueAt', now] },
                    { $lt: ['$dueAt', tomorrow] },
                  ],
                },
                then: 1,
              },
              { case: { $eq: ['$status', 'in_progress'] }, then: 2 },
            ],
            default: 3,
          },
        },
      },
    },
    { $set: { _urgentDue: { $cond: [{ $lt: ['$_attentionRank', 2] }, '$dueAt', null] } } },
    {
      $sort: {
        _attentionRank: 1,
        _urgentDue: 1,
        _priorityRank: 1,
        _noDue: 1,
        dueAt: 1,
        createdAt: 1,
        _id: 1,
      },
    },
  ];
}
