import { lazy, Suspense, useEffect } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  Link,
  type Location,
} from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUser, authKey } from '../features/auth';
import { useWorkflow } from '../features/workflow';
import { AppShell } from '../components/AppShell';
import { Button, ErrorState, LoadingState } from '../components/ui';
const AuthPage = lazy(() =>
  import('../pages/AuthPage').then((module) => ({ default: module.AuthPage })),
);
const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const TasksPage = lazy(() =>
  import('../pages/TasksPage').then((module) => ({ default: module.TasksPage })),
);
const TaskDetailPage = lazy(() =>
  import('../pages/TaskDetailPage').then((module) => ({ default: module.TaskDetailPage })),
);
const TaskFormPage = lazy(() =>
  import('../pages/TaskFormPage').then((module) => ({ default: module.TaskFormPage })),
);
const ProfilePage = lazy(() =>
  import('../pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const TrashPage = lazy(() =>
  import('../pages/TrashPage').then((module) => ({ default: module.TrashPage })),
);
function ProtectedRoute() {
  const { data: user, isPending, error, refetch } = useUser();
  const workflow = useWorkflow(!!user);
  const location = useLocation();
  if (isPending) return <LoadingState full />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  if (user && !workflow.known) {
    if (workflow.error)
      return (
        <div className="capability-error">
          <h1>Chưa thể xác định tính năng đang hỗ trợ</h1>
          <ErrorState error={workflow.error} retry={() => void workflow.retry()} />
        </div>
      );
    return <LoadingState full />;
  }
  return user ? (
    <Outlet />
  ) : (
    <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  );
}
export function App() {
  const client = useQueryClient();
  const location = useLocation();
  const background = location.state?.backgroundLocation as Location | undefined;
  const isForm = /^\/tasks\/(new|[a-f\d]{24}\/edit)$/.test(location.pathname);
  const backgroundLocation =
    isForm && background?.pathname?.startsWith('/') && !background.pathname.startsWith('//')
      ? background
      : undefined;
  useEffect(() => {
    const expired = () => {
      client.setQueryData(authKey, null);
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    };
    window.addEventListener('taskflow:session-expired', expired);
    return () => window.removeEventListener('taskflow:session-expired', expired);
  }, [client]);
  return (
    <Suspense fallback={<LoadingState full />}>
      <Routes location={backgroundLocation ?? location}>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage register />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/new" element={<TaskFormPage />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
            <Route path="/tasks/:id/edit" element={<TaskFormPage />} />
            <Route path="/trash" element={<TrashPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <div className="feedback-state full-state">
              <span className="notfound-code">404</span>
              <h1>Không tìm thấy trang</h1>
              <p>Trang bạn tìm có thể đã được chuyển hoặc không còn tồn tại.</p>
              <Button asChild>
                <Link to="/dashboard">Về tổng quan</Link>
              </Button>
            </div>
          }
        />
      </Routes>
      {backgroundLocation && (
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/tasks/new" element={<TaskFormPage modal />} />
            <Route path="/tasks/:id/edit" element={<TaskFormPage modal />} />
          </Route>
        </Routes>
      )}
    </Suspense>
  );
}
