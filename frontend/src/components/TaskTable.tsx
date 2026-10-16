import { CalendarDays, ChevronRight, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Task } from '../types';
import { formatDate } from '../lib/date';
import { PriorityBadge, StatusBadge } from './ui';
import { cn } from '../lib/cn';
import { useTaskMutation } from '../features/tasks';
export function TaskTable({ tasks }: { tasks: Task[] }) {
  const mutation = useTaskMutation();
  return (
    <div className="task-table-wrap">
      <table className="task-table">
        <thead>
          <tr>
            <th className="check-cell">
              <span className="sr-only">Hoàn thành</span>
            </th>
            <th>Tên công việc</th>
            <th>Thời hạn</th>
            <th>Ưu tiên</th>
            <th>Trạng thái</th>
            <th>
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className={cn(task.status === 'completed' && 'task-completed')}>
              <td className="check-cell">
                <input
                  type="checkbox"
                  className="task-checkbox"
                  aria-label={'Hoàn thành: ' + task.title}
                  checked={task.status === 'completed'}
                  disabled={mutation.isPending}
                  onChange={(event) =>
                    mutation.mutate({
                      id: task.id,
                      values: { status: event.target.checked ? 'completed' : 'pending' },
                    })
                  }
                />
              </td>
              <td className="task-name-cell">
                <Link to={'/tasks/' + task.id} className="task-name">
                  {task.title}
                  <ChevronRight size={15} className="mobile-chevron" />
                </Link>
                <p>{task.description || 'Chưa có mô tả'}</p>
                <div className="task-mobile-meta">
                  <PriorityBadge priority={task.priority} />
                  <span className={cn('date-label', task.isOverdue && 'overdue-text')}>
                    <CalendarDays size={13} />
                    {task.dueAt ? formatDate(task.dueAt) : 'Chưa có hạn'}
                  </span>
                </div>
              </td>
              <td className={cn('desktop-cell date-cell', task.isOverdue && 'overdue-text')}>
                <span className="date-label">
                  <CalendarDays size={15} />
                  {formatDate(task.dueAt)}
                </span>
                {task.isOverdue && <small>Đã quá hạn</small>}
              </td>
              <td className="desktop-cell">
                <PriorityBadge priority={task.priority} />
              </td>
              <td className="desktop-cell">
                <StatusBadge status={task.status} />
              </td>
              <td className="desktop-cell">
                <Link
                  className="icon-button"
                  to={'/tasks/' + task.id + '/edit'}
                  state={{ returnTo: '/tasks' }}
                  aria-label={'Chỉnh sửa: ' + task.title}
                >
                  <Pencil size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
