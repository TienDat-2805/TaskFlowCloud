import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { Task, TaskActivity } from '../types';
import { api, body } from '../lib/api';
import { formatDate } from '../lib/date';
import { deadlineLabel, priorities, statuses } from '../lib/workflow';
import { useTaskMutation, refreshTasks } from '../features/tasks';
import { useWorkflow } from '../features/workflow';
import { Button, ErrorState, LoadingState, PriorityBadge, StatusBadge } from '../components/ui';
import { ConfirmAction, ConflictNotice, StatusChoices } from '../components/WorkflowControls';
const eventLabels: Record<TaskActivity['type'], string> = {
  created: 'Tạo công việc',
  started: 'Bắt đầu thực hiện',
  status_changed: 'Đổi trạng thái',
  deadline_changed: 'Đổi thời hạn',
  priority_changed: 'Đổi mức ưu tiên',
  title_changed: 'Đổi tên công việc',
  deleted: 'Chuyển vào thùng rác',
  restored: 'Khôi phục công việc',
};
const eventValue = (value: string | null) =>
  value ? (({ ...statuses, ...priorities } as Record<string, string>)[value] ?? value) : '—';
export function TaskDetailPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { enabled } = useWorkflow();
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey: ['tasks', 'detail', id],
    queryFn: async () => (await api<{ data: Task }>('/api/tasks/' + id)).data,
    retry: false,
  });
  const mutation = useTaskMutation();
  const deletion = useMutation({
    mutationFn: (task: Task) =>
      api('/api/tasks/' + id, {
        method: 'DELETE',
        body: body({ expectedRevision: task.revision ?? 0 }),
      }),
    onSuccess: async () => {
      setConfirm(false);
      client.removeQueries({ queryKey: ['tasks', 'detail', id] });
      navigate('/tasks');
      await refreshTasks(client);
      toast.success(enabled ? 'Đã chuyển vào thùng rác' : 'Đã xóa công việc');
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const task = query.data;
  const from =
    typeof location.state?.returnTo === 'string' && location.state.returnTo.startsWith('/tasks?')
      ? location.state.returnTo
      : '/tasks';
  return (
    <>
      <Link className="back-link" to={from}>
        ← Trở lại danh sách
      </Link>
      <div className="page-heading detail-heading">
        <div>
          <h1>{task.title}</h1>
          <div className="detail-title-badges">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.isOverdue && <span className="badge tone-red">Quá hạn</span>}
          </div>
        </div>
        <div className="heading-actions">
          <Button asChild>
            <Link to={'/tasks/' + id + '/edit'} state={{ backgroundLocation: location }}>
              Sửa công việc
            </Link>
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            {enabled ? 'Chuyển vào thùng rác' : 'Xóa'}
          </Button>
        </div>
      </div>
      <ConflictNotice
        error={mutation.error || deletion.error}
        reload={() => void query.refetch()}
      />
      <div className="detail-grid">
        <section className="surface detail-description">
          <h2>Mô tả công việc</h2>
          <p className="description-text">
            {task.description || 'Chưa có mô tả cho công việc này.'}
          </p>
          <StatusChoices
            value={task.status}
            onChange={(status) => mutation.mutate({ task, values: { status } })}
            disabled={mutation.isPending || deletion.isPending}
          />
          <p className="muted">
            Bắt đầu lần đầu: {task.startedAt ? formatDate(task.startedAt, true) : 'Chưa bắt đầu'}
          </p>
        </section>
        <aside className="surface detail-info">
          <h2>Thông tin công việc</h2>
          {[
            ['Hạn cuối', deadlineLabel(task)],
            [
              'Kiểu hạn',
              task.dueMode === 'date'
                ? 'Chỉ ngày · ' + task.dueTimeZone
                : task.dueAt
                  ? 'Ngày và giờ'
                  : 'Không hạn',
            ],
            ['Mức ưu tiên', priorities[task.priority]],
            [
              'Thời điểm hoàn thành',
              task.completedAt ? formatDate(task.completedAt, true) : 'Chưa hoàn thành',
            ],
          ].map(([label, value]) => (
            <div className="info-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </aside>
      </div>
      <section className="surface activity-panel">
        <h2>Lịch sử hoạt động</h2>
        {task.activity?.length ? (
          <ol className="activity-list">
            {task.activity.map((event) => (
              <li key={event.eventId}>
                <span className="timeline-dot" />
                <time dateTime={event.at}>{formatDate(event.at, true)}</time>
                <strong>{eventLabels[event.type]}</strong>
                <span>
                  {event.from != null ? eventValue(event.from) + ' → ' : ''}
                  {eventValue(event.to)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="section-empty">
            Chưa có lịch sử hoạt động. Các thay đổi mới sẽ được ghi lại từ bây giờ.
          </p>
        )}
        <p className="muted">Hiển thị tối đa 100 hoạt động gần nhất.</p>
      </section>
      <ConfirmAction
        open={confirm}
        onOpenChange={setConfirm}
        title={enabled ? 'Chuyển vào thùng rác?' : 'Xóa công việc?'}
        description={
          enabled
            ? 'Bạn có thể khôi phục công việc trong tối đa 30 ngày.'
            : 'Công việc sẽ bị xóa vĩnh viễn và không thể hoàn tác.'
        }
        action={enabled ? 'Chuyển vào thùng rác' : 'Xóa công việc'}
        onConfirm={() => deletion.mutate(task)}
        pending={deletion.isPending}
      />
    </>
  );
}
