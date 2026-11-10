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
  time: string;
  timeZone: string;
}
export function deadlineValues(task?: Task): DeadlineValues {
  const local = localDateInput(task?.dueAt ?? null);
  const date = task?.dueMode === 'date' ? task.dueDate : local.slice(0, 10);
  return {
    mode: task?.dueMode ?? (task?.dueAt ? 'datetime' : 'none'),
    date: date ? date.split('-').reverse().join('/') : '',
    time: local.slice(11, 16),
    timeZone: task?.dueTimeZone ?? timeZone(),
  };
}
export function parseDeadlineDate(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) throw new Error('Nhập ngày theo dạng DD/MM/YYYY, ví dụ 25/12/2026.');
  const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const date = new Date(iso + 'T12:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso)
    throw new Error('Ngày không tồn tại. Vui lòng kiểm tra ngày, tháng và năm.');
  return iso;
}
export function deadlinePayload(values: DeadlineValues): DueInput {
  if (values.mode === 'none') return { mode: 'none' };
  const isoDate = parseDeadlineDate(values.date);
  if (values.mode === 'date') {
    try {
      new Intl.DateTimeFormat('vi-VN', { timeZone: values.timeZone }).format();
    } catch {
      throw new Error('Múi giờ không hợp lệ.');
    }
    return { mode: 'date', date: isoDate, timeZone: values.timeZone };
  }
  const time = values.time.trim();
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('Nhập giờ từ 00:00 đến 23:59 theo dạng HH:mm, ví dụ 17:30.');
  const at = isoDate + 'T' + time.padStart(5, '0');
  const date = new Date(at);
  if (Number.isNaN(date.getTime()) || localDateInput(date.toISOString()) !== at)
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
