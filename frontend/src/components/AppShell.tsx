import {
  CheckCheck,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Plus,
  Settings,
  Cloud,
  ArrowUpRight,
  Trash2,
} from 'lucide-react';
import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUser, authKey } from '../features/auth';
import { api, body } from '../lib/api';
import { Button } from './ui';
import { useWorkflow } from '../features/workflow';
import { useTaskClock } from '../features/taskClock';

const nav = [
  { to: '/dashboard', title: 'Tổng quan', icon: LayoutDashboard },
  { to: '/tasks', title: 'Công việc của tôi', mobile: 'Công việc', icon: ListTodo },
  { to: '/trash', title: 'Thùng rác', icon: Trash2 },
];
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link to="/dashboard" className={'brand' + (light ? ' brand-light' : '')}>
      <span className="brand-icon">
        <CheckCheck size={23} strokeWidth={2.6} />
      </span>
      <span>
        TaskFlow<span className="brand-cloud">Cloud</span>
      </span>
    </Link>
  );
}
export function AppShell() {
  const { data: user } = useUser();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { enabled, error: workflowError, retry } = useWorkflow();
  const now = useTaskClock();
  const visibleNav = nav.filter((item) => item.to !== '/trash' || enabled);
  const logout = useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST', body: body({}) }),
    onSuccess: () => {
      client.clear();
      client.setQueryData(authKey, null);
      navigate('/login');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Chuyển đến nội dung
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="nav-caption">TỔ CHỨC CÔNG VIỆC</div>
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {visibleNav.map(({ to, title, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={19} />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>
        <Link to="/profile" className="sidebar-profile">
          <Settings size={16} /> Tài khoản
        </Link>
        <div className="sidebar-tip">
          <span className="tip-icon">
            <Cloud size={22} />
          </span>
          <strong>Từng bước, tiến xa hơn.</strong>
          <p>Một kế hoạch rõ ràng cho những điều quan trọng.</p>
          <Link to="/tasks/new" state={{ backgroundLocation: location }}>
            Lên kế hoạch ngay <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{user?.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{user?.name}</strong>
            <span>Tài khoản cá nhân</span>
          </div>
          <button
            className="icon-button"
            aria-label="Đăng xuất"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context">
            <strong>TASKFLOW CLOUD / v0.2</strong>
            <p>Kế hoạch rõ ràng · Từng bước hoàn thành</p>
          </div>
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Intl.DateTimeFormat('vi-VN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(now)}
            </span>
            <Link to="/profile" className="avatar" aria-label="Tài khoản cá nhân">
              {user?.name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>
        <main id="main-content" className="page-content">
          {workflowError && (
            <div className="capability-notice" role="alert">
              <p>Chưa thể cập nhật cấu hình tính năng. Các thao tác xóa đang tạm khóa.</p>
              <Button variant="secondary" onClick={() => void retry()}>
                Thử lại cấu hình
              </Button>
            </div>
          )}
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>TaskFlow Cloud</span>
          <span>Rõ kế hoạch. Trọn mục tiêu.</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Điều hướng di động">
        {visibleNav.map(({ to, title, icon: Icon }) => (
          <NavLink key={to} to={to}>
            <Icon size={21} />
            <span>{title === 'Công việc của tôi' ? 'Công việc' : title}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
export function NewTaskButton() {
  const location = useLocation();
  return (
    <Button asChild>
      <Link to="/tasks/new" state={{ backgroundLocation: location }}>
        <Plus size={18} />
        <span>Tạo công việc</span>
      </Link>
    </Button>
  );
}
