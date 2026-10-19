import { useState } from 'react';
import { MoreHorizontal, Play, Pause } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '../types';
import { attentionReason, deadlineLabel } from '../lib/workflow';
import { PriorityBadge, StatusBadge } from './ui';
import { useTaskMutation, refreshTasks } from '../features/tasks';
import { ConflictNotice, QuickEdit } from './WorkflowControls';
import { useWorkflow } from '../features/workflow';
function TaskRow({ task, attention }: { task: Task; attention: boolean }) {
  const mutation = useTaskMutation();
  const [editing, setEditing] = useState<{ top: number; left: number } | null>(null);
  const { enabled } = useWorkflow();
  const location = useLocation();
  const client = useQueryClient();
  return (
    <tr className={task.status === 'completed' ? 'task-completed' : ''}>
      <td className="check-cell">
        <input
          type="checkbox"
          className="task-checkbox"
          aria-label={'Hoàn thành: ' + task.title}
          checked={task.status === 'completed'}
          disabled={mutation.isPending}
          onChange={(e) =>
            mutation.mutate({
              task,
              values: { status: e.target.checked ? 'completed' : 'pending' },
            })
          }
        />
      </td>
      <td className="task-name-cell">
        <Link
          to={'/tasks/' + task.id}
          state={{ returnTo: location.pathname + location.search }}
          className="task-name"
        >
          {task.title}
        </Link>
        <p>{attention ? attentionReason(task) : deadlineLabel(task)}</p>
        <div className="task-mobile-meta">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>
        <ConflictNotice
          error={mutation.error}
          reload={() => {
            void refreshTasks(client);
          }}
        />
      </td>
      <td className={'desktop-cell date-cell' + (task.isOverdue ? ' overdue-text' : '')}>
        {deadlineLabel(task)}
        {task.isOverdue && <small>Quá hạn</small>}
      </td>
      <td className="desktop-cell">
        <PriorityBadge priority={task.priority} />
      </td>
      <td className="desktop-cell">
        <StatusBadge status={task.status} />
      </td>
      <td className="row-action">
        {enabled && task.status !== 'completed' && (
          <button
            className="icon-button start-action"
            aria-label={(task.status === 'in_progress' ? 'Tạm dừng: ' : 'Bắt đầu: ') + task.title}
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                task,
                values: { status: task.status === 'in_progress' ? 'pending' : 'in_progress' },
              })
            }
          >
            {task.status === 'in_progress' ? <Pause size={15} /> : <Play size={15} />}
          </button>
        )}
        <button
          className="icon-button"
          aria-label={'Sửa nhanh: ' + task.title}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setEditing({
              top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 600)),
              left: Math.max(12, rect.right - 400),
            });
          }}
          disabled={mutation.isPending}
        >
          <MoreHorizontal size={18} />
        </button>
        {editing && <QuickEdit task={task} anchor={editing} onClose={() => setEditing(null)} />}
      </td>
    </tr>
  );
}
export function TaskTable({ tasks, attention = false }: { tasks: Task[]; attention?: boolean }) {
  return (
    <div className={'task-table-wrap' + (attention ? ' attention-table' : '')}>
      <table className="task-table">
        <thead>
          <tr>
            <th className="check-cell">
              <span className="sr-only">Hoàn thành</span>
            </th>
            <th>Công việc</th>
            <th>Hạn chót</th>
            <th>Ưu tiên</th>
            <th>Trạng thái</th>
            <th>
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} attention={attention} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
