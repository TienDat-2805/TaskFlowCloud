import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Brand } from '../components/AppShell';
import { Button, Field, Input, ErrorState, LoadingState } from '../components/ui';
import { api, body } from '../lib/api';
import { authKey, useUser } from '../features/auth';
import type { User } from '../types';

export function AuthPage({ register: isRegister = false }: { register?: boolean }) {
  const { data: user, isPending, error, refetch } = useUser();
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const schema = z
    .object({
      name: isRegister ? z.string().trim().min(1, 'Vui lòng nhập họ tên.').max(80) : z.string(),
      email: z.string().trim().toLowerCase().pipe(z.email('Vui lòng nhập email hợp lệ.')),
      password: z
        .string()
        .min(8, 'Mật khẩu cần ít nhất 8 ký tự.')
        .max(72, 'Mật khẩu tối đa 72 ký tự.')
        .refine((v) => new TextEncoder().encode(v).length <= 72, 'Mật khẩu tối đa 72 byte UTF-8.'),
      confirm: z.string(),
    })
    .refine((v) => !isRegister || v.password === v.confirm, {
      path: ['confirm'],
      message: 'Mật khẩu xác nhận chưa khớp.',
    });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { name: '', email: '', password: '', confirm: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      api<{ data: User }>('/api/auth/' + (isRegister ? 'register' : 'login'), {
        method: 'POST',
        body: body(
          isRegister
            ? { name: values.name, email: values.email, password: values.password }
            : { email: values.email, password: values.password },
        ),
      }),
    onSuccess: ({ data }) => {
      client.clear();
      client.setQueryData(authKey, data);
      const from = location.state?.from as string | undefined;
      navigate(from?.startsWith('/') && !from.startsWith('//') ? from : '/dashboard', {
        replace: true,
      });
    },
  });
  if (isPending) return <LoadingState full />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Brand light />
        <div className="auth-story-content">
          <span className="eyebrow">MỖI NGÀY, MỘT BƯỚC TIẾN</span>
          <h1>
            Sắp xếp công việc.
            <br />
            <span>Đón những thành công.</span>
          </h1>
          <p>
            Tập trung vào điều quan trọng. TaskFlow giúp bạn quản lý công việc và biến kế hoạch
            thành kết quả.
          </p>
          <div className="auth-preview">
            <div className="preview-heading">
              <span>Ngày làm việc của bạn</span>
              <span className="preview-dot">● ● ●</span>
            </div>
            {[
              'Lên kế hoạch cho ngày mới',
              'Tập trung vào mục tiêu hôm nay',
              'Hoàn thành những điều quan trọng',
            ].map((text, index) => (
              <div className="preview-task" key={text}>
                <span className={index === 0 ? 'preview-check done' : 'preview-check'}>
                  {index === 0 && <Check size={13} />}
                </span>
                <span>{text}</span>
                <span className={'preview-line line-' + index} />
              </div>
            ))}
            <div className="preview-progress">
              <span>Mỗi bước nhỏ đều có ý nghĩa</span>
              <div>
                <i />
              </div>
            </div>
          </div>
          <div className="auth-assurance">
            <ShieldCheck size={18} /> Không gian riêng cho công việc của bạn
          </div>
        </div>
        <div className="auth-story-footer">© {new Date().getFullYear()} TaskFlow Cloud</div>
      </aside>
      <main className="auth-form-side">
        <div className="auth-form-box">
          <div className="auth-mobile-logo">
            <Brand />
          </div>
          <span className="auth-greeting">
            {isRegister ? 'HÀNH TRÌNH MỚI BẮT ĐẦU' : 'CHÀO MỪNG TRỞ LẠI'}
          </span>
          <h2>{isRegister ? 'Tạo tài khoản mới' : 'Đăng nhập tài khoản'}</h2>
          <p className="auth-subtitle">
            {isRegister
              ? 'Bắt đầu quản lý công việc hiệu quả cùng TaskFlow.'
              : 'Tiếp tục hành trình làm việc hiệu quả của bạn.'}
          </p>
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
            {isRegister && (
              <Field label="Họ và tên" htmlFor="name" error={errors.name?.message}>
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="Nguyễn Văn An"
                  aria-invalid={!!errors.name}
                  {...register('name')}
                />
              </Field>
            )}
            <Field label="Địa chỉ email" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="ban@example.com"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
            </Field>
            <Field
              label="Mật khẩu"
              htmlFor="password"
              error={errors.password?.message}
              hint={isRegister ? 'Sử dụng ít nhất 8 ký tự, tối đa 72 byte UTF-8.' : undefined}
            >
              <div className="password-field">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="Nhập mật khẩu của bạn"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            {isRegister && (
              <Field label="Xác nhận mật khẩu" htmlFor="confirm" error={errors.confirm?.message}>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu"
                  aria-invalid={!!errors.confirm}
                  {...register('confirm')}
                />
              </Field>
            )}
            {mutation.error && (
              <p className="inline-error" role="alert">
                {mutation.error.message}
              </p>
            )}
            <Button className="auth-submit" disabled={mutation.isPending}>
              {mutation.isPending ? <LoaderCircle className="animate-spin" size={18} /> : null}
              {isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
            <Link to={isRegister ? '/login' : '/register'}>
              {isRegister ? 'Đăng nhập' : 'Đăng ký miễn phí'}
            </Link>
          </p>
          <p className="auth-bottom">
            <ShieldCheck size={15} /> Dữ liệu cá nhân được bảo vệ theo tài khoản
          </p>
        </div>
      </main>
    </div>
  );
}
