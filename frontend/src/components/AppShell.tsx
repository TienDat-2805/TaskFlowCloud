import {
  CheckCheck,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Plus,
  Settings,
  Cloud,
  ArrowUpRight,
} from 'lucide-react';
import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUser, authKey } from '../features/auth';
import { api, body } from '../lib/api';
import { Button } from './ui';

const nav = [
  { to: '/dashboard', title: 'Tổng quan', icon: LayoutDashboard },
  { to: '/tasks', title: 'Công việc của tôi', mobile: 'Công việc', icon: ListTodo },
  { to: '/profile', title: 'Cài đặt tài khoản', mobile: 'Cài đặt', icon: Settings },
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
        <div className="nav-caption">KHÔNG GIAN LÀM VIỆC</div>
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {nav.map(({ to, title, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={19} />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-icon">
            <Cloud size={22} />
          </span>
          <strong>Từng bước, tiến xa hơn.</strong>
          <p>Một kế hoạch rõ ràng cho những điều quan trọng.</p>
          <Link to="/tasks/new" state={{ returnTo: location.pathname }}>
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
          <span className="topbar-context">
            Không gian cá nhân <span>/</span>{' '}
            <strong>
              {location.pathname.startsWith('/dashboard')
                ? 'Tổng quan'
                : location.pathname.startsWith('/profile')
                  ? 'Cài đặt'
                  : 'Công việc'}
            </strong>
          </span>
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Intl.DateTimeFormat('vi-VN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date())}
            </span>
            <Link to="/profile" className="avatar" aria-label="Tài khoản cá nhân">
              {user?.name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>
        <main id="main-content" className="page-content">
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>TaskFlow Cloud</span>
          <span>Rõ kế hoạch. Trọn mục tiêu.</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Điều hướng di động">
        {nav.map(({ to, title, mobile, icon: Icon }) => (
          <NavLink key={to} to={to}>
            <Icon size={21} />
            <span>{mobile ?? title}</span>
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
      <Link to="/tasks/new" state={{ returnTo: location.pathname + location.search }}>
        <Plus size={18} />
        <span>Tạo công việc</span>
      </Link>
    </Button>
  );
}
