import { DateTime, IANAZone } from 'luxon';
import { z } from 'zod';

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => IANAZone.isValidZone(value), 'Múi giờ IANA không hợp lệ.');
export const dueSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z
    .object({ mode: z.literal('date'), date: z.iso.date(), timeZone: timeZoneSchema })
    .strict()
    .refine(
      (value) => {
        const date = DateTime.fromISO(value.date, { zone: value.timeZone });
        return date.isValid && date.toISODate() === value.date;
      },
      { message: 'Ngày không tồn tại trong múi giờ đã chọn.', path: ['date'] },
    ),
  z
    .object({
      mode: z.literal('datetime'),
      at: z.iso.datetime({ offset: true }),
      timeZone: timeZoneSchema.optional(),
    })
    .strict(),
]);
export type DueInput = z.infer<typeof dueSchema>;
export type DueMode = DueInput['mode'];
export type DueBucket = 'overdue' | 'today' | 'upcoming' | 'no_due' | 'later' | 'completed';
export interface DueFields {
  dueAt: Date | null;
  dueMode: DueMode;
  dueDate: string | null;
  dueTimeZone: string | null;
}
export function normalizeDue(due: DueInput): DueFields {
  if (due.mode === 'none')
    return { dueAt: null, dueMode: 'none', dueDate: null, dueTimeZone: null };
  if (due.mode === 'date')
    return {
      dueAt: DateTime.fromISO(due.date, { zone: due.timeZone }).endOf('day').toJSDate(),
      dueMode: 'date',
      dueDate: due.date,
      dueTimeZone: due.timeZone,
    };
  return {
    dueAt: DateTime.fromISO(due.at, { setZone: true }).toUTC().toJSDate(),
    dueMode: 'datetime',
    dueDate: null,
    dueTimeZone: due.timeZone ?? null,
  };
}
export function legacyDue(dueAt: string | Date | null): DueFields {
  return dueAt === null
    ? normalizeDue({ mode: 'none' })
    : {
        dueAt: new Date(dueAt),
        dueMode: 'datetime',
        dueDate: null,
        dueTimeZone: null,
      };
}
export function dayBounds(now: Date, timeZone: string) {
  const start = DateTime.fromJSDate(now, { zone: timeZone }).startOf('day');
  return {
    tomorrow: start.plus({ days: 1 }).toJSDate(),
    upcomingEnd: start.plus({ days: 8 }).toJSDate(),
  };
}
export function dueBucket(
  task: { status: string; dueAt: Date | null },
  now: Date,
  timeZone: string,
): DueBucket {
  if (task.status === 'completed') return 'completed';
  if (!task.dueAt) return 'no_due';
  if (task.dueAt.getTime() < now.getTime()) return 'overdue';
  const bounds = dayBounds(now, timeZone);
  if (task.dueAt < bounds.tomorrow) return 'today';
  if (task.dueAt < bounds.upcomingEnd) return 'upcoming';
  return 'later';
}
