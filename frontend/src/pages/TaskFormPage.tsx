import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LoaderCircle, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, body } from '../lib/api';
import { localDateInput } from '../lib/date';
import type { Task } from '../types';
import { Button, ErrorState, Field, FormDialog, Input, LoadingState } from '../components/ui';
import { TasksPage } from './TasksPage';

const schema = z.object({
  title: z.string().trim().min(1, 'Vui lòng nhập tên công việc.').max(120, 'Tên tối đa 120 ký tự.'),
  description: z.string().max(2000, 'Mô tả tối đa 2000 ký tự.'),
  dueAt: z
    .string()
    .refine(
      (value) => !value || !Number.isNaN(new Date(value).getTime()),
      'Ngày giờ không hợp lệ.',
    ),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['pending', 'completed']),
});
type Values = z.infer<typeof schema>;
function TaskForm({ task, onClose }: { task?: Task; onClose: () => void }) {
  const client = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      dueAt: localDateInput(task?.dueAt ?? null),
      priority: task?.priority ?? 'medium',
      status: task?.status ?? 'pending',
    },
  });
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);
  const mutation = useMutation({
    mutationFn: (values: Values) =>
      api<{ data: Task }>('/api/tasks' + (task ? '/' + task.id : ''), {
        method: task ? 'PATCH' : 'POST',
        body: body({
          ...values,
          dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null,
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tasks'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      toast.success(task ? 'Đã lưu thay đổi' : 'Đã tạo công việc mới');
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError)
        for (const detail of error.details) {
          if (['title', 'description', 'dueAt', 'priority', 'status'].includes(detail.field))
            setError(detail.field as keyof Values, { message: detail.message });
        }
    },
  });
  const close = () => {
    if (mutation.isPending) return;
    if (!isDirty || window.confirm('Bạn có thay đổi chưa lưu. Bạn muốn đóng biểu mẫu?')) onClose();
  };
  return (
    <FormDialog
      title={task ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'}
      description={
        task
          ? 'Cập nhật kế hoạch để luôn đi đúng hướng.'
          : 'Thêm một bước tiến mới cho mục tiêu của bạn.'
      }
      onClose={close}
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
        className="task-form"
      >
        <Field label="Tên công việc *" htmlFor="title" error={errors.title?.message}>
          <Input
            id="title"
            autoFocus
            placeholder="Bạn cần hoàn thành điều gì?"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'title-error' : undefined}
            {...register('title')}
          />
        </Field>
        <Field label="Mô tả" htmlFor="description" error={errors.description?.message}>
          <textarea
            id="description"
            className="input textarea"
            rows={4}
            placeholder="Thêm một vài chi tiết cho công việc…"
            {...register('description')}
          />
        </Field>
        <Field
          label="Thời hạn"
          htmlFor="dueAt"
          error={errors.dueAt?.message}
          hint="Ngày giờ theo múi giờ trên thiết bị của bạn."
        >
          <Input id="dueAt" type="datetime-local" {...register('dueAt')} />
        </Field>
        <div className="form-row">
          <Field label="Độ ưu tiên" htmlFor="priority" error={errors.priority?.message}>
            <select id="priority" className="input" {...register('priority')}>
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
            </select>
          </Field>
          <Field label="Trạng thái" htmlFor="status" error={errors.status?.message}>
            <select id="status" className="input" {...register('status')}>
              <option value="pending">Chưa hoàn thành</option>
              <option value="completed">Đã hoàn thành</option>
            </select>
          </Field>
        </div>
        {mutation.error && (
          <p className="inline-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={close} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button disabled={mutation.isPending}>
            {mutation.isPending ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : task ? (
              <Save size={16} />
            ) : (
              <Plus size={16} />
            )}
            {task ? 'Lưu thay đổi' : 'Tạo công việc'}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
export function TaskFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const task = useQuery({
    queryKey: ['tasks', 'detail', id],
    queryFn: async () => (await api<{ data: Task }>('/api/tasks/' + id)).data,
    enabled: !!id,
    retry: false,
  });
  const close = () =>
    navigate(
      location.state?.returnTo?.startsWith('/tasks') || location.state?.returnTo === '/dashboard'
        ? location.state.returnTo
        : id
          ? '/tasks/' + id
          : '/tasks',
    );
  if (id && task.isPending) return <LoadingState />;
  if (id && task.error) return <ErrorState error={task.error} retry={() => void task.refetch()} />;
  return (
    <>
      <TasksPage />
      <TaskForm key={id ?? 'new'} task={task.data} onClose={close} />
    </>
  );
}
