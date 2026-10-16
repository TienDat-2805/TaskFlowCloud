import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CheckCheck,
  Clock3,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Task } from '../types';
import { api } from '../lib/api';
import { formatDate } from '../lib/date';
import { useTaskMutation } from '../features/tasks';
import {
  Button,
  ConfirmDelete,
  ErrorState,
  LoadingState,
  PriorityBadge,
  StatusBadge,
} from '../components/ui';

export function TaskDetailPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const taskQuery = useQuery({
    queryKey: ['tasks', 'detail', id],
    queryFn: async () => (await api<{ data: Task }>('/api/tasks/' + id)).data,
    retry: false,
  });
  const mutation = useTaskMutation();
  const deletion = useMutation({
    mutationFn: () => api('/api/tasks/' + id, { method: 'DELETE' }),
    onSuccess: async () => {
      client.removeQueries({ queryKey: ['tasks', 'detail', id] });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tasks', 'list'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      toast.success('Đã xóa công việc');
      navigate('/tasks');
    },
    onError: (error) => toast.error(error.message),
  });
  if (taskQuery.isPending) return <LoadingState />;
  if (taskQuery.error)
    return (
      <>
        <Link className="back-link" to="/tasks">
          <ArrowLeft size={17} /> Quay lại công việc
        </Link>
        <ErrorState error={taskQuery.error} retry={() => void taskQuery.refetch()} />
      </>
    );
  const task = taskQuery.data;
  return (
    <>
      <Link className="back-link" to="/tasks">
        <ArrowLeft size={17} /> Quay lại công việc
      </Link>
      <div className="page-heading detail-heading">
        <div>
          <div className="page-kicker">CHI TIẾT CÔNG VIỆC</div>
          <h1>{task.title}</h1>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" asChild>
            <Link to={'/tasks/' + id + '/edit'} state={{ returnTo: '/tasks/' + id }}>
              <Pencil size={16} /> Chỉnh sửa
            </Link>
          </Button>
          <Button variant="ghost" className="danger-text" onClick={() => setConfirmOpen(true)}>
            <Trash2 size={17} /> Xóa
          </Button>
        </div>
      </div>
      <div className="detail-grid">
        <section className="surface detail-description">
          <div className="detail-badges">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.isOverdue && <span className="badge priority-high">Đã quá hạn</span>}
          </div>
          <h2>Mô tả công việc</h2>
          <p className="description-text">
            {task.description || 'Chưa có mô tả cho công việc này.'}
          </p>
          <div className="detail-complete">
            <div>
              <CheckCheck size={22} />
              <span>
                {task.status === 'completed'
                  ? 'Bạn đã hoàn thành công việc này!'
                  : 'Sẵn sàng hoàn thành mục tiêu này?'}
              </span>
            </div>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  id: task.id,
                  values: { status: task.status === 'completed' ? 'pending' : 'completed' },
                })
              }
            >
              {task.status === 'completed' ? <RotateCcw size={16} /> : <CheckCheck size={17} />}
              {task.status === 'completed' ? 'Mở lại công việc' : 'Đánh dấu hoàn thành'}
            </Button>
          </div>
        </section>
        <aside className="surface detail-info">
          <h2>Thông tin công việc</h2>
          {[
            { icon: CalendarDays, label: 'Thời hạn', value: task.dueAt },
            { icon: Clock3, label: 'Ngày tạo', value: task.createdAt },
            { icon: Clock3, label: 'Cập nhật lần cuối', value: task.updatedAt },
            ...(task.completedAt
              ? [{ icon: CheckCheck, label: 'Hoàn thành lúc', value: task.completedAt }]
              : []),
          ].map(({ icon: Icon, label, value }) => (
            <div className="info-row" key={label}>
              <Icon size={19} />
              <div>
                <span>{label}</span>
                <strong>{formatDate(value, true)}</strong>
              </div>
            </div>
          ))}
        </aside>
      </div>
      <ConfirmDelete
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={task.title}
        onConfirm={() => deletion.mutate()}
        pending={deletion.isPending}
      />
    </>
  );
}
