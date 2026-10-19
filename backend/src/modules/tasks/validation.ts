import { z } from 'zod';
import type { Request } from 'express';
import { ApiError } from '../../lib/errors.js';
import { dueSchema, timeZoneSchema } from './deadline.js';

const fields = {
  title: z.string().trim().min(1, 'Vui lòng nhập tên công việc.').max(120, 'Tên tối đa 120 ký tự.'),
  description: z.string().max(2000, 'Mô tả tối đa 2000 ký tự.'),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['pending', 'in_progress', 'completed']),
  due: dueSchema.optional(),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
};
const oneDeadline = (value: { due?: unknown; dueAt?: unknown }) =>
  !(value.due !== undefined && value.dueAt !== undefined);
export const createTaskSchema = z
  .object({
    ...fields,
    description: fields.description.default(''),
    priority: fields.priority.default('medium'),
    status: fields.status.default('pending'),
  })
  .strict()
  .refine(oneDeadline, { path: ['due'], message: 'Chỉ truyền due hoặc dueAt.' });
export const patchTaskSchema = z
  .object({ ...fields, expectedRevision: z.number().int().nonnegative().optional() })
  .partial()
  .strict()
  .refine(oneDeadline, { path: ['due'], message: 'Chỉ truyền due hoặc dueAt.' })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedRevision'),
    'Cần ít nhất một trường cập nhật.',
  );
export type TaskPatch = z.infer<typeof patchTaskSchema>;
export const revisionBodySchema = z
  .object({ expectedRevision: z.number().int().nonnegative().optional() })
  .strict();
export const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID công việc không hợp lệ.');
export const paginationFields = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const listSchema = z
  .object({
    ...paginationFields,
    status: z.enum(['all', 'pending', 'in_progress', 'completed', 'active']).default('all'),
    priority: z.enum(['all', 'low', 'medium', 'high']).default('all'),
    due: z.enum(['all', 'overdue', 'today', 'upcoming', 'no_due']).default('all'),
    search: z.string().trim().max(120).default(''),
    sort: z
      .enum([
        'createdAt_desc',
        'dueAt_asc',
        'dueAt_desc',
        'title_asc',
        'priority_desc',
        'attention',
      ])
      .default('createdAt_desc'),
    timeZone: timeZoneSchema.default('UTC'),
  })
  .strict();
export type TaskQuery = z.infer<typeof listSchema>;
export function expectedRevision(req: Request, bodyRevision: number | undefined, required = false) {
  const header = req.get('If-Match');
  let revision = bodyRevision;
  if (header !== undefined) {
    const match = /^"v(0|[1-9]\d*)"$/.exec(header);
    if (!match || !Number.isSafeInteger(Number(match[1])))
      throw new ApiError(422, 'INVALID_REVISION', 'If-Match cần có dạng "v7".');
    const parsed = Number(match[1]);
    if (revision !== undefined && revision !== parsed)
      throw new ApiError(422, 'INVALID_REVISION', 'Revision trong header và nội dung không khớp.');
    revision = parsed;
  }
  if (required && revision === undefined)
    throw new ApiError(422, 'REVISION_REQUIRED', 'Cần gửi revision hiện tại của công việc.');
  return revision;
}
