import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCheck, Clock3, Flag, Layers3, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Summary } from '../types';
import { useUser } from '../features/auth';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { NewTaskButton } from '../components/AppShell';
import { TaskTable } from '../components/TaskTable';
export function DashboardPage() {
  const { data: user } = useUser();
  const summary = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api<{ data: Summary }>('/api/dashboard/summary')).data,
  });
  if (summary.isPending) return <LoadingState />;
  if (summary.error)
    return <ErrorState error={summary.error} retry={() => void summary.refetch()} />;
  const data = summary.data;
  const stats = [
    {
      title: 'Tổng công việc',
      value: data.total,
      icon: Layers3,
      tone: 'brand',
      note: 'Tất cả kế hoạch của bạn',
      to: '/tasks',
    },
    {
      title: 'Đã hoàn thành',
      value: data.completed,
      icon: CheckCheck,
      tone: 'green',
      note: 'Những mục tiêu đã đạt được',
      to: '/tasks?status=completed',
    },
    {
      title: 'Chưa hoàn thành',
      value: data.pending,
      icon: Clock3,
      tone: 'orange',
      note: 'Tiếp tục từng bước nhỏ',
      to: '/tasks?status=pending',
    },
    {
      title: 'Đã quá hạn',
      value: data.overdue,
      icon: Flag,
      tone: 'red',
      note: 'Công việc cần bạn ưu tiên',
      to: '/tasks?status=pending&sort=dueAt_asc',
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-kicker">
            <Sparkles size={15} /> MỘT NGÀY MỚI, MỘT CƠ HỘI MỚI
          </div>
          <h1>
            Xin chào, {user?.name.split(' ').at(-1)} <span className="greeting-wave">☀</span>
          </h1>
          <p>Cùng biến những kế hoạch hôm nay thành kết quả.</p>
        </div>
        <NewTaskButton />
      </div>
      <div className="stats-grid">
        {stats.map(({ title, value, icon: Icon, tone, note, to }) => (
          <Link to={to} className="surface stat-card" key={title}>
            <div className="stat-top">
              <span>{title}</span>
              <span className={'stat-icon tone-' + tone}>
                <Icon size={20} />
              </span>
            </div>
            <strong>{value.toString().padStart(2, '0')}</strong>
            <p>{note}</p>
          </Link>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="surface upcoming-panel">
          <div className="section-heading">
            <div>
              <h2>Công việc sắp đến hạn</h2>
              <p>Ưu tiên những việc cần sự chú ý của bạn.</p>
            </div>
            <Link className="text-link" to="/tasks?status=pending&sort=dueAt_asc">
              Xem tất cả <ArrowRight size={15} />
            </Link>
          </div>
          {data.upcoming.length ? <TaskTable tasks={data.upcoming} /> : <EmptyState />}
        </section>
        <aside className="dashboard-aside">
          <section className="surface progress-card">
            <div className="section-title">
              <h2>Tiến độ của bạn</h2>
              <TrendingUp size={20} />
            </div>
            <div
              className="progress-ring"
              style={{
                background:
                  'conic-gradient(var(--color-bg-brand) ' +
                  data.completionRate +
                  '%, var(--color-bg-subtle) 0)',
              }}
            >
              <div>
                <strong>{data.completionRate}%</strong>
                <span>Hoàn thành</span>
              </div>
            </div>
            <p>
              <strong>{data.completed}</strong> trên <strong>{data.total}</strong> công việc đã xong
            </p>
            <div className="progress-legend">
              <span>
                <i /> Đã hoàn thành
              </span>
              <span>
                <i /> Còn lại
              </span>
            </div>
          </section>
          <section className="focus-card">
            <span className="focus-star">
              <Sparkles size={22} />
            </span>
            <h2>
              Tập trung vào điều
              <br />
              quan trọng nhất.
            </h2>
            <p>Chọn một công việc, bắt đầu từ bước nhỏ và duy trì nhịp tiến bộ của bạn.</p>
            <Button variant="secondary" asChild>
              <Link to="/tasks?status=pending">
                Xem công việc <ArrowRight size={15} />
              </Link>
            </Button>
          </section>
        </aside>
      </div>
    </>
  );
}
