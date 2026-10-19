import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { api, body } from '../lib/api';
import type { Task, TaskList } from '../types';
import { formatDate } from '../lib/date';
import { timeZone } from '../lib/workflow';
import { Button, ErrorState, LoadingState } from '../components/ui';
import { ConfirmAction, ConflictNotice } from '../components/WorkflowControls';
import { refreshTasks } from '../features/tasks';
function TrashRow({ task }: { task: Task }) {
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (permanent: boolean) =>
      api('/api/tasks/' + task.id + (permanent ? '/permanent' : '/restore'), {
        method: permanent ? 'DELETE' : 'POST',
        body: body({ expectedRevision: task.revision }),
      }),
    onSuccess: async (_, permanent) => {
      setConfirm(false);
      toast.success(permanent ? 'Đã xóa vĩnh viễn' : 'Đã khôi phục công việc');
      await refreshTasks(client);
    },
    onError: (error) => toast.error(error.message),
  });
  const days = task.purgeAt
    ? Math.max(0, Math.ceil((new Date(task.purgeAt).getTime() - now) / 86_400_000))
    : 0;
  return (
    <article className="trash-row">
      <div>
        <h3>{task.title}</h3>
        <p>Đã xóa {formatDate(task.deletedAt ?? null)}</p>
      </div>
      <span className="badge tone-orange">
        {days ? 'Còn ' + days + ' ngày' : 'Hết hạn khôi phục'}
      </span>
      <div className="trash-actions">
        <Button disabled={mutation.isPending || !days} onClick={() => mutation.mutate(false)}>
          <RotateCcw size={15} />
          Khôi phục
        </Button>
        <Button variant="secondary" disabled={mutation.isPending} onClick={() => setConfirm(true)}>
          Xóa vĩnh viễn
        </Button>
      </div>
      <ConflictNotice
        error={mutation.error}
        reload={() => {
          void refreshTasks(client);
        }}
      />
      <ConfirmAction
        open={confirm}
        onOpenChange={setConfirm}
        title="Xóa vĩnh viễn công việc?"
        description={'Công việc “' + task.title + '” sẽ bị xóa và không thể khôi phục.'}
        action="Xóa vĩnh viễn"
        confirmationText={task.title}
        onConfirm={() => mutation.mutate(true)}
        pending={mutation.isPending}
      />
    </article>
  );
}
export function TrashPage() {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('page') ?? 1);
  const page = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100000) : 1;
  const query = useQuery({
    queryKey: ['tasks', 'trash', page],
    queryFn: () =>
      api<TaskList>(
        '/api/tasks/trash?' +
          new URLSearchParams({ page: String(page), limit: '10', timeZone: timeZone() }),
      ),
    retry: false,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Thùng rác</h1>
          <p>Khôi phục các công việc đã xóa trong tối đa 30 ngày.</p>
        </div>
      </div>
      <div className="trash-banner">
        <strong>Lưu tạm · Tự động dọn dẹp sau tối đa 30 ngày</strong>
        <p>Khôi phục giữ nguyên tiến độ, deadline và mức ưu tiên trước khi xóa.</p>
      </div>
      <section className="surface trash-panel">
        {query.isPending ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <>
            <h2>{query.data.pagination.total} công việc đã xóa</h2>
            {query.data.data.map((task) => (
              <TrashRow key={task.id} task={task} />
            ))}
            {!query.data.data.length && <p className="section-empty">Thùng rác đang trống.</p>}
            {query.data.pagination.totalPages > 1 && (
              <div className="pagination">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setParams({ page: String(page - 1) })}
                >
                  Trang trước
                </Button>
                <span>Trang {page}</span>
                <Button
                  variant="secondary"
                  disabled={page >= query.data.pagination.totalPages}
                  onClick={() => setParams({ page: String(page + 1) })}
                >
                  Trang sau
                </Button>
              </div>
            )}
            {page > 1 && !query.data.data.length && (
              <Button variant="secondary" onClick={() => setParams({})}>
                Về trang đầu
              </Button>
            )}
          </>
        )}
      </section>
      <Link className="text-link" to="/tasks">
        ← Quay lại công việc
      </Link>
    </>
  );
}
