import { useQuery } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, ListTodo } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { TaskList } from '../types';
import { Button, EmptyState, ErrorState, Input, LoadingState } from '../components/ui';
import { NewTaskButton } from '../components/AppShell';
import { TaskTable } from '../components/TaskTable';

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const rawStatus = params.get('status') ?? 'all';
  const status = ['all', 'pending', 'completed'].includes(rawStatus) ? rawStatus : 'all';
  const rawSort = params.get('sort') ?? 'createdAt_desc';
  const sort = ['createdAt_desc', 'dueAt_asc', 'dueAt_desc', 'title_asc'].includes(rawSort)
    ? rawSort
    : 'createdAt_desc';
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => next.set(key, value));
    setParams(next, { replace: true });
  }
  const query = new URLSearchParams({ status, sort, page: String(page), search, limit: '10' });
  const tasks = useQuery({
    queryKey: ['tasks', 'list', query.toString()],
    queryFn: () => api<TaskList>('/api/tasks?' + query),
    retry: 1,
  });
  const filtered = status !== 'all' || !!search;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-kicker">
            <ListTodo size={15} /> KHÔNG GIAN CỦA BẠN
          </div>
          <h1>Công việc của tôi</h1>
          <p>Sắp xếp rõ ràng, hoàn thành từng mục tiêu.</p>
        </div>
        <NewTaskButton />
      </div>
      <section className="surface tasks-panel">
        <div className="task-toolbar">
          <div className="filter-tabs" role="group" aria-label="Lọc trạng thái">
            {[
              ['all', 'Tất cả'],
              ['pending', 'Chưa hoàn thành'],
              ['completed', 'Đã hoàn thành'],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={status === value}
                className={status === value ? 'active' : ''}
                onClick={() => update({ status: value, page: '1' })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="search-sort">
            <div className="search-field">
              <Search size={17} />
              <Input
                aria-label="Tìm công việc"
                placeholder="Tìm kiếm công việc…"
                value={search}
                maxLength={120}
                onChange={(event) => update({ search: event.target.value, page: '1' })}
              />
            </div>
            <select
              className="input sort-select"
              aria-label="Sắp xếp công việc"
              value={sort}
              onChange={(event) => update({ sort: event.target.value, page: '1' })}
            >
              <option value="createdAt_desc">Mới nhất</option>
              <option value="dueAt_asc">Hạn gần nhất</option>
              <option value="dueAt_desc">Hạn xa nhất</option>
              <option value="title_asc">Tên A–Z</option>
            </select>
          </div>
        </div>
        {tasks.isPending ? (
          <LoadingState />
        ) : tasks.error ? (
          <ErrorState error={tasks.error} retry={() => void tasks.refetch()} />
        ) : tasks.data.data.length ? (
          <TaskTable tasks={tasks.data.data} />
        ) : page > 1 ? (
          <div className="feedback-state">
            <p>Trang này không còn công việc.</p>
            <Button variant="secondary" onClick={() => update({ page: '1' })}>
              Về trang đầu
            </Button>
          </div>
        ) : (
          <EmptyState
            filtered={filtered}
            reset={() => {
              setParams({});
            }}
          />
        )}
        {tasks.data && tasks.data.pagination.total > 0 && (
          <div className="pagination">
            <span>
              {tasks.data.data.length ? (page - 1) * 10 + 1 : 0}–
              {Math.min(page * 10, tasks.data.pagination.total)} trên {tasks.data.pagination.total}{' '}
              công việc
            </span>
            <div>
              <Button
                variant="secondary"
                aria-label="Trang trước"
                disabled={page <= 1 || tasks.isFetching}
                onClick={() => update({ page: String(page - 1) })}
              >
                <ChevronLeft size={16} />
              </Button>
              <span>
                Trang {page} / {tasks.data.pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                aria-label="Trang sau"
                disabled={page >= tasks.data.pagination.totalPages || tasks.isFetching}
                onClick={() => update({ page: String(page + 1) })}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </section>
      <p className="list-hint">Mỗi việc hoàn thành là một bước tiến gần hơn đến mục tiêu.</p>
    </>
  );
}
