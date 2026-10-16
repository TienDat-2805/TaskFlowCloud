import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authKey, useUser } from '../features/auth';
import { api, body } from '../lib/api';
import { formatDate } from '../lib/date';
import { Button } from '../components/ui';
export function ProfilePage() {
  const { data: user } = useUser();
  const client = useQueryClient();
  const navigate = useNavigate();
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
    <>
      <div className="page-heading">
        <div>
          <div className="page-kicker">KHÔNG GIAN CÁ NHÂN</div>
          <h1>Cài đặt tài khoản</h1>
          <p>Thông tin tài khoản và phiên đăng nhập của bạn.</p>
        </div>
      </div>
      <section className="surface profile-card">
        <div className="profile-banner" />
        <div className="profile-body">
          <div className="avatar profile-avatar">{user?.name.slice(0, 1).toUpperCase()}</div>
          <h2>{user?.name}</h2>
          <p>Thành viên từ {formatDate(user?.createdAt ?? null)}</p>
          <div className="profile-fields">
            <div>
              <UserRound size={19} />
              <span>
                Họ và tên<strong>{user?.name}</strong>
              </span>
            </div>
            <div>
              <Mail size={19} />
              <span>
                Địa chỉ email<strong>{user?.email}</strong>
              </span>
            </div>
          </div>
          <div className="profile-security">
            <ShieldCheck size={22} />
            <div>
              <strong>Không gian làm việc riêng tư</strong>
              <p>Công việc của bạn chỉ hiển thị trong tài khoản này.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            className="danger-text"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut size={17} /> Đăng xuất tài khoản
          </Button>
        </div>
      </section>
    </>
  );
}
