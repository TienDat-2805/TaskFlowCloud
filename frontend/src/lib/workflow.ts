import type { DueInput, Task, TaskStatus, TaskPriority } from '../types';
import { localDateInput } from './date';
export const statuses: Record<TaskStatus, string> = {
  pending: 'Cần làm',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
};
export const priorities: Record<TaskPriority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
};
export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const taskDue = (task: Task): DueInput =>
  task.dueMode === 'date' && task.dueDate
    ? { mode: 'date', date: task.dueDate, timeZone: task.dueTimeZone || timeZone() }
    : task.dueAt
      ? {
          mode: 'datetime',
          at: task.dueAt,
          ...(task.dueTimeZone ? { timeZone: task.dueTimeZone } : {}),
        }
      : { mode: 'none' };
export interface DeadlineValues {
  mode: 'none' | 'date' | 'datetime';
  date: string;
  at: string;
  timeZone: string;
}
export const deadlineValues = (task?: Task): DeadlineValues => ({
  mode: task?.dueMode ?? (task?.dueAt ? 'datetime' : 'none'),
  date: task?.dueDate ?? '',
  at: localDateInput(task?.dueAt ?? null),
  timeZone: task?.dueTimeZone ?? timeZone(),
});
export function deadlinePayload(values: DeadlineValues): DueInput {
  if (values.mode === 'none') return { mode: 'none' };
  if (values.mode === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error('Vui lòng chọn ngày hết hạn.');
    try {
      new Intl.DateTimeFormat('vi-VN', { timeZone: values.timeZone }).format();
    } catch {
      throw new Error('Múi giờ không hợp lệ.');
    }
    return { mode: 'date', date: values.date, timeZone: values.timeZone };
  }
  const date = new Date(values.at);
  if (
    !values.at ||
    Number.isNaN(date.getTime()) ||
    localDateInput(date.toISOString()) !== values.at
  )
    throw new Error('Ngày giờ không tồn tại trên thiết bị của bạn.');
  return { mode: 'datetime', at: date.toISOString(), timeZone: timeZone() };
}
export function deadlineLabel(task: Task) {
  if (task.dueMode === 'date' && task.dueDate) {
    const [year, month, day] = task.dueDate.split('-');
    return day + '/' + month + '/' + year + ' · Cả ngày';
  }
  if (!task.dueAt) return 'Không thời hạn';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(task.dueAt));
}
export const attentionReason = (task: Task) =>
  task.isOverdue
    ? 'Đã quá hạn · Ưu tiên ' + priorities[task.priority].toLowerCase()
    : task.dueBucket === 'today'
      ? 'Đến hạn hôm nay · ' + deadlineLabel(task)
      : task.status === 'in_progress'
        ? 'Đang thực hiện · ' + deadlineLabel(task)
        : 'Ưu tiên ' + priorities[task.priority].toLowerCase() + ' · ' + deadlineLabel(task);
