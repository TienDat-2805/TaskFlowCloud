import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUser, authKey } from '../features/auth';
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
function ProtectedRoute() {
  const { data: user, isPending, error, refetch } = useUser();
  const location = useLocation();
  if (isPending) return <LoadingState full />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  return user ? (
    <Outlet />
  ) : (
    <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  );
}
export function App() {
  const client = useQueryClient();
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
      <Routes>
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
    </Suspense>
  );
}
