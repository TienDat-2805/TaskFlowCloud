import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { timeZone } from '../lib/workflow';
import type { TaskList } from '../types';
import { Button, EmptyState, ErrorState, Input, LoadingState, FormDialog } from '../components/ui';
import { NewTaskButton } from '../components/AppShell';
import { TaskTable } from '../components/TaskTable';
import { QuickAdd } from '../components/WorkflowControls';
const options = {
  status: [
    ['all', 'Tất cả trạng thái'],
    ['active', 'Chưa hoàn thành'],
    ['pending', 'Cần làm'],
    ['in_progress', 'Đang làm'],
    ['completed', 'Hoàn thành'],
  ],
  priority: [
    ['all', 'Tất cả ưu tiên'],
    ['low', 'Ưu tiên thấp'],
    ['medium', 'Ưu tiên vừa'],
    ['high', 'Ưu tiên cao'],
  ],
  due: [
    ['all', 'Mọi thời hạn'],
    ['overdue', 'Quá hạn'],
    ['today', 'Hạn hôm nay'],
    ['upcoming', 'Sắp tới (7 ngày)'],
    ['no_due', 'Không hạn'],
  ],
  sort: [
    ['attention', 'Cần xử lý trước'],
    ['createdAt_desc', 'Mới nhất'],
    ['priority_desc', 'Ưu tiên cao trước'],
    ['dueAt_asc', 'Hạn gần nhất'],
    ['dueAt_desc', 'Hạn xa nhất'],
    ['title_asc', 'Tên A–Z'],
  ],
};
type FilterKey = keyof typeof options;
function valid(key: FilterKey, value: string | null) {
  return options[key].some(([v]) => v === value) ? value! : key === 'sort' ? 'attention' : 'all';
}
export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const urlSearch = (params.get('search') ?? '').slice(0, 120);
  const [draft, setDraft] = useState({ url: urlSearch, value: urlSearch });
  if (draft.url !== urlSearch) setDraft({ url: urlSearch, value: urlSearch });
  const search = draft.value;
  const setSearch = (value: string) => setDraft({ url: urlSearch, value });
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileDraft, setMobileDraft] = useState<Record<FilterKey, string>>({
    status: 'all',
    priority: 'all',
    due: 'all',
    sort: 'attention',
  });
  const latestParams = useRef(params);
  useEffect(() => {
    latestParams.current = params;
  }, [params]);
  // Debounce only local typing. Navigating Back/Forward immediately adopts the URL.
  useEffect(() => {
    if (search === urlSearch) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(latestParams.current);
      if (search.trim()) next.set('search', search.trim());
      else next.delete('search');
      next.set('page', '1');
      setParams(next);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, urlSearch, setParams]);
  const values = {
    status: valid('status', params.get('status')),
    priority: valid('priority', params.get('priority')),
    due: valid('due', params.get('due')),
    sort: valid('sort', params.get('sort')),
  };
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
  function update(value: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries({ page: '1', ...value }).forEach(([key, v]) => {
      if (v === 'all' || !v) next.delete(key);
      else next.set(key, v);
    });
    setParams(next);
  }
  const query = new URLSearchParams({
    ...values,
    page: String(page),
    search: urlSearch,
    limit: '10',
    timeZone: timeZone(),
  });
  const tasks = useQuery({
    queryKey: ['tasks', 'list', query.toString()],
    queryFn: () => api<TaskList>('/api/tasks?' + query),
    retry: 1,
  });
  const filtered =
    values.status !== 'all' || values.priority !== 'all' || values.due !== 'all' || !!urlSearch;
  const reset = () => {
    setSearch('');
    setParams({});
  };
  const selects = (
    selected = values,
    onChange: (changed: Record<string, string>) => void = update,
  ) => (
    <div className="advanced-selects">
      {(Object.keys(options) as FilterKey[]).map((key) => (
        <label key={key}>
          {{ status: 'Trạng thái', priority: 'Mức ưu tiên', due: 'Thời hạn', sort: 'Sắp xếp' }[key]}
          <select
            aria-label={
              {
                status: 'Lọc trạng thái',
                priority: 'Lọc ưu tiên',
                due: 'Lọc thời hạn',
                sort: 'Sắp xếp công việc',
              }[key]
            }
            className="input"
            value={selected[key]}
            onChange={(e) => onChange({ [key]: e.target.value })}
          >
            {options[key].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Công việc của tôi</h1>
          <p>Bộ lọc kết hợp, sắp xếp thông minh và thao tác nhanh.</p>
        </div>
        <NewTaskButton />
      </div>
      <QuickAdd />
      <section className="surface advanced-filters">
        <div className="search-filter-row">
          <div className="search-field">
            <Search size={16} />
            <Input
              aria-label="Tìm công việc"
              placeholder="Tìm công việc…"
              value={search}
              maxLength={120}
              onChange={(e) => {
                setSearch(e.target.value);
                if (!e.target.value) update({ search: '' });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') update({ search: search.trim() });
              }}
            />
          </div>
          <Button
            variant="secondary"
            className="mobile-filter-toggle"
            onClick={() => {
              setMobileDraft(values);
              setFilterOpen(true);
            }}
          >
            <SlidersHorizontal size={16} />
            Bộ lọc
          </Button>
          <button className="text-link reset-filters" onClick={reset}>
            Xóa toàn bộ
          </button>
        </div>
        <div className="desktop-filters">{selects()}</div>
        <div className="filter-chips" aria-label="Bộ lọc đang áp dụng">
          {(['status', 'priority', 'due'] as const)
            .filter((key) => values[key] !== 'all')
            .map((key) => (
              <button
                key={key}
                className={'badge chip-' + key}
                onClick={() => update({ [key]: 'all' })}
              >
                {options[key].find(([v]) => v === values[key])?.[1]} ×
              </button>
            ))}
        </div>
      </section>
      {filterOpen && (
        <FormDialog
          title="Bộ lọc nâng cao"
          description="Kết hợp điều kiện để tìm chính xác."
          onClose={() => setFilterOpen(false)}
        >
          <div className="task-form">
            {selects(mobileDraft, (changed) =>
              setMobileDraft((current) => ({ ...current, ...changed })),
            )}
            <div className="dialog-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  setMobileDraft({ status: 'all', priority: 'all', due: 'all', sort: 'attention' })
                }
              >
                Xóa bộ lọc
              </Button>
              <Button
                onClick={() => {
                  update(mobileDraft);
                  setFilterOpen(false);
                }}
              >
                Áp dụng bộ lọc
              </Button>
            </div>
          </div>
        </FormDialog>
      )}
      <section className="surface tasks-panel" aria-busy={tasks.isFetching}>
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
          <EmptyState filtered={filtered} reset={reset} />
        )}
        {tasks.data && tasks.data.pagination.total > 0 && (
          <div className="pagination">
            <span>
              {tasks.data.pagination.total} kết quả · Trang {page} /{' '}
              {tasks.data.pagination.totalPages}
            </span>
            <div>
              <Button
                variant="secondary"
                aria-label="Trang trước"
                disabled={page <= 1 || tasks.isFetching}
                onClick={() => update({ page: String(page - 1) })}
              >
                ←
              </Button>
              <Button
                variant="secondary"
                aria-label="Trang sau"
                disabled={page >= tasks.data.pagination.totalPages || tasks.isFetching}
                onClick={() => update({ page: String(page + 1) })}
              >
                →
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
