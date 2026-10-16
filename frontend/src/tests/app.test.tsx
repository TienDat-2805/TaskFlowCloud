import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../app/App';
import type { Task } from '../types';

configure({ asyncUtilTimeout: 5000 });
const user = {
  id: 'a'.repeat(24),
  name: 'Nguyễn Văn An',
  email: 'an@example.com',
  createdAt: '2026-10-01T00:00:00Z',
};
const originalTask: Task = {
  id: 'b'.repeat(24),
  title: 'Kiểm thử Docker',
  description: 'Đóng gói ứng dụng',
  priority: 'high',
  status: 'pending',
  dueAt: null,
  completedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  isOverdue: false,
};
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function mount(route: string, handler: Handler) {
  const fetch = vi.fn((url: string, init?: RequestInit) => handler(String(url), init));
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetch, client, interaction: userEvent.setup() };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('frontend application flows (mock HTTP, no live Atlas writes)', () => {
  it('guards private routes and displays an actionable login form', async () => {
    mount('/tasks', () => json({ error: { code: 'UNAUTHORIZED', message: 'Đăng nhập' } }, 401));
    expect(await screen.findByRole('heading', { name: 'Đăng nhập tài khoản' })).toBeTruthy();
    expect(screen.getByLabelText('Địa chỉ email')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Công việc của tôi' })).toBeNull();
  });
  it('shows login failures, then uses the authenticated response for dashboard data', async () => {
    let loggedIn = false;
    let attempts = 0;
    const { interaction } = mount('/login', (url, init) => {
      if (url === '/api/auth/me') return loggedIn ? json({ data: user }) : json({}, 401);
      if (url === '/api/auth/login') {
        expect(init?.credentials).toBe('same-origin');
        attempts++;
        if (attempts === 1)
          return json(
            { error: { code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng.' } },
            401,
          );
        loggedIn = true;
        return json({ data: user });
      }
      if (url === '/api/dashboard/summary')
        return json({
          data: {
            total: 3,
            completed: 1,
            pending: 2,
            overdue: 0,
            completionRate: 33,
            upcoming: [],
          },
        });
      return json({}, 404);
    });
    await screen.findByRole('heading', { name: 'Đăng nhập tài khoản' });
    await interaction.type(screen.getByLabelText('Địa chỉ email'), 'an@example.com');
    await interaction.type(screen.getByLabelText('Mật khẩu'), 'SafePassword123');
    await interaction.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Email hoặc mật khẩu không đúng.',
    );
    await interaction.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('heading', { name: /Xin chào, An/ })).toBeTruthy();
    expect(screen.getByText('33%')).toBeTruthy();
  });
  it('validates the create form and sends trimmed data only after a valid submit', async () => {
    let tasks: Task[] = [];
    let created: Record<string, unknown> | undefined;
    const { interaction } = mount('/tasks/new', (url, init) => {
      if (url === '/api/auth/me') return json({ data: user });
      if (url === '/api/tasks' && init?.method === 'POST') {
        created = JSON.parse(init.body as string);
        tasks = [{ ...originalTask, ...created }];
        return json({ data: tasks[0] }, 201);
      }
      if (url.startsWith('/api/tasks?'))
        return json({
          data: tasks,
          pagination: { page: 1, limit: 10, total: tasks.length, totalPages: tasks.length ? 1 : 0 },
        });
      return json({}, 404);
    });
    await screen.findByRole('dialog', { name: 'Tạo công việc mới' });
    await interaction.click(screen.getByRole('button', { name: 'Tạo công việc' }));
    expect(await screen.findByText('Vui lòng nhập tên công việc.')).toBeTruthy();
    expect(created).toBeUndefined();
    await interaction.type(screen.getByLabelText('Tên công việc *'), '  Công việc thật  ');
    await interaction.click(screen.getByRole('button', { name: 'Tạo công việc' }));
    await waitFor(() =>
      expect(created).toMatchObject({
        title: 'Công việc thật',
        dueAt: null,
        priority: 'medium',
        status: 'pending',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('link', { name: 'Công việc thật' })).toBeTruthy();
  });
  it('requires confirmation before deleting and returns to the real list result', async () => {
    let deleted = false;
    const { interaction } = mount('/tasks/' + originalTask.id, (url, init) => {
      if (url === '/api/auth/me') return json({ data: user });
      if (url === '/api/tasks/' + originalTask.id && init?.method === 'DELETE') {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (url === '/api/tasks/' + originalTask.id) return json({ data: originalTask });
      if (url.startsWith('/api/tasks?'))
        return json({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
      return json({}, 404);
    });
    await screen.findByRole('heading', { name: originalTask.title });
    await interaction.click(screen.getByRole('button', { name: 'Xóa' }));
    await screen.findByRole('alertdialog', { name: 'Xóa công việc?' });
    expect(deleted).toBe(false);
    await interaction.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(deleted).toBe(false);
    await interaction.click(screen.getByRole('button', { name: 'Xóa' }));
    await interaction.click(screen.getByRole('button', { name: 'Xóa công việc' }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByRole('heading', { name: 'Công việc của tôi' })).toBeTruthy();
  });
  it('shows API errors with retry instead of presenting an empty success', async () => {
    let attempts = 0;
    const { interaction } = mount('/tasks', (url) => {
      if (url === '/api/auth/me') return json({ data: user });
      if (url.startsWith('/api/tasks?')) {
        attempts++;
        return json(
          { error: { code: 'INTERNAL_ERROR', message: 'Máy chủ tạm thời không khả dụng.' } },
          500,
        );
      }
      return json({}, 404);
    });
    expect(await screen.findByText('Máy chủ tạm thời không khả dụng.')).toBeTruthy();
    expect(screen.queryByText('Bắt đầu một ngày có kế hoạch')).toBeNull();
    const before = attempts;
    await interaction.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(attempts).toBeGreaterThan(before));
  });
});
