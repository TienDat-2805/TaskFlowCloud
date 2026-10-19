import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { timeZone } from '../lib/workflow';
import type { Summary } from '../types';
import { ErrorState, LoadingState } from '../components/ui';
import { NewTaskButton } from '../components/AppShell';
import { TaskTable } from '../components/TaskTable';
import { QuickAdd } from '../components/WorkflowControls';
export function DashboardPage() {
  const zone = timeZone();
  const summary = useQuery({
    queryKey: ['dashboard', zone],
    queryFn: async () =>
      (await api<{ data: Summary }>('/api/dashboard/summary?timeZone=' + encodeURIComponent(zone)))
        .data,
  });
  if (summary.isPending) return <LoadingState />;
  if (summary.error)
    return <ErrorState error={summary.error} retry={() => void summary.refetch()} />;
  const data = summary.data;
  const stats = [
    ['Tổng công việc', data.total, 'brand', '/tasks'],
    ['Cần làm', data.pending, 'orange', '/tasks?status=pending'],
    ['Đang thực hiện', data.inProgress ?? 0, 'brand', '/tasks?status=in_progress'],
    ['Hoàn thành', data.completed, 'green', '/tasks?status=completed'],
    ['Quá hạn', data.overdue, 'red', '/tasks?status=active&due=overdue&sort=attention'],
  ] as const;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Điều gì cần xử lý hôm nay?</h1>
          <p>Các công việc được sắp theo hạn, trạng thái và mức ưu tiên.</p>
        </div>
        <NewTaskButton />
      </div>
      <div className="stats-grid workflow-stats">
        {stats.map(([title, value, tone, to]) => (
          <Link to={to} className="surface stat-card" key={title}>
            <span className={'badge tone-' + tone}>{title}</span>
            <strong>{value}</strong>
            <p>Mở danh sách đã lọc →</p>
          </Link>
        ))}
      </div>
      <QuickAdd />
      <div className="workflow-dashboard">
        <section className="surface attention-panel">
          <div className="section-heading">
            <div>
              <h2>Cần xử lý trước</h2>
              <p>Lý do ưu tiên được hiển thị rõ trên từng công việc</p>
            </div>
            <Link className="text-link" to="/tasks?status=active&sort=attention">
              Xem tất cả →
            </Link>
          </div>
          {data.attention?.length ? (
            <TaskTable tasks={data.attention} attention />
          ) : (
            <p className="section-empty">
              Bạn đã xử lý hết công việc. Thêm mục tiêu mới ở phía trên.
            </p>
          )}
        </section>
        <aside className="surface deadline-progress">
          <h2>Thời hạn & Tiến độ</h2>
          <Link to="/tasks?status=active&due=overdue&sort=attention" className="deadline-link">
            <span className="badge tone-red">{data.overdue} việc quá hạn</span>
            <p>Xem và điều chỉnh deadline →</p>
          </Link>
          <Link to="/tasks?status=active&due=today&sort=dueAt_asc" className="deadline-link">
            <span className="badge tone-orange">{data.dueToday ?? 0} việc hôm nay</span>
            <p>Xem nhiệm vụ trong ngày →</p>
          </Link>
          <Link to="/tasks?status=active&due=upcoming&sort=dueAt_asc" className="text-link">
            Sắp tới: {data.upcomingCount ?? 0} công việc →
          </Link>
          <p className="progress-caption">
            Tiến độ hoàn thành: {data.completed} / {data.total} · {data.completionRate}%
          </p>
          <progress max={100} value={data.completionRate} aria-label="Tiến độ hoàn thành" />
        </aside>
      </div>
    </>
  );
}
