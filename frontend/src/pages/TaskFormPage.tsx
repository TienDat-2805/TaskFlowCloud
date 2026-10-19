import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError, body } from '../lib/api';
import { deadlinePayload, deadlineValues } from '../lib/workflow';
import type { Task, TaskInput } from '../types';
import { Button, ErrorState, Field, FormDialog, Input, LoadingState } from '../components/ui';
import {
  ConfirmAction,
  ConflictNotice,
  DeadlineFields,
  PriorityChoices,
  StatusChoices,
} from '../components/WorkflowControls';
import { refreshTasks } from '../features/tasks';

function TaskForm({
  task,
  onClose,
  modal,
  reload,
}: {
  task?: Task;
  onClose: () => void;
  modal: boolean;
  reload: () => void;
}) {
  const client = useQueryClient();
  const [editingTask] = useState(task);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 'medium');
  const [status, setStatus] = useState(task?.status ?? 'pending');
  const [deadline, setDeadline] = useState(deadlineValues(task));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [original] = useState(() =>
    JSON.stringify({ title, description, priority, status, deadline }),
  );
  const dirty = JSON.stringify({ title, description, priority, status, deadline }) !== original;
  const allowLeave = useRef(false);
  const blocker = useBlocker(() => dirty && !allowLeave.current);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const mutation = useMutation({
    mutationFn: (values: TaskInput) =>
      api<{ data: Task }>('/api/tasks' + (editingTask ? '/' + editingTask.id : ''), {
        method: editingTask ? 'PATCH' : 'POST',
        body: body({
          ...values,
          ...(editingTask ? { expectedRevision: editingTask.revision ?? 0 } : {}),
        }),
      }),
    onSuccess: async () => {
      allowLeave.current = true;
      await refreshTasks(client);
      toast.success(task ? 'Đã lưu thay đổi' : 'Đã tạo công việc mới');
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError)
        setErrors(
          Object.fromEntries(
            error.details.map((detail) => [detail.field.split('.')[0], detail.message]),
          ),
        );
    },
  });
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty && !allowLeave.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  const close = () => {
    if (!mutation.isPending) onClose();
  };
  const content = (
    <>
      <form
        className="task-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const validation: Record<string, string> = {};
          if (!title.trim()) validation.title = 'Vui lòng nhập tên công việc.';
          else if (title.trim().length > 120) validation.title = 'Tên tối đa 120 ký tự.';
          if (description.length > 2000) validation.description = 'Mô tả tối đa 2000 ký tự.';
          let due: TaskInput['due'] = { mode: 'none' };
          try {
            due = deadlinePayload(deadline);
          } catch (error) {
            validation.due = (error as Error).message;
          }
          setErrors(validation);
          if (!Object.keys(validation).length)
            mutation.mutate({ title: title.trim(), description, priority, status, due });
        }}
      >
        <fieldset disabled={mutation.isPending}>
          <Field label="Tên công việc *" htmlFor="title" error={errors.title}>
            <Input
              id="title"
              autoFocus
              maxLength={120}
              placeholder="Bạn cần hoàn thành điều gì?"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'title-error' : undefined}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Mô tả" htmlFor="description" error={errors.description}>
            <textarea
              id="description"
              className="input textarea"
              rows={3}
              maxLength={2000}
              placeholder="Mô tả công việc…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <StatusChoices value={status} onChange={setStatus} />
          <DeadlineFields value={deadline} onChange={setDeadline} />
          {errors.due && (
            <p className="field-error" role="alert">
              {errors.due}
            </p>
          )}
          <PriorityChoices value={priority} onChange={setPriority} />
        </fieldset>
        {mutation.error && (
          <p className="inline-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <ConflictNotice error={mutation.error} reload={() => setReloadConfirm(true)} />
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={close} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang lưu…' : task ? 'Lưu thay đổi' : 'Tạo công việc'}
          </Button>
        </div>
      </form>
      <ConfirmAction
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
        title="Bỏ thay đổi chưa lưu?"
        description="Các thay đổi trong biểu mẫu sẽ không được lưu."
        action="Bỏ thay đổi"
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
      <ConfirmAction
        open={reloadConfirm}
        onOpenChange={setReloadConfirm}
        title="Tải bản cập nhật mới nhất?"
        description="Nội dung chưa lưu trong biểu mẫu sẽ được thay bằng dữ liệu từ máy chủ."
        action="Tải lại dữ liệu"
        onConfirm={() => {
          setReloadConfirm(false);
          reload();
        }}
      />
    </>
  );
  return modal ? (
    <FormDialog
      title={task ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'}
      description="Linh hoạt deadline · Chỉnh sửa an toàn"
      onClose={close}
    >
      {content}
    </FormDialog>
  ) : (
    <section className="surface standalone-form">
      <div className="dialog-heading">
        <div>
          <h1>{task ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'}</h1>
          <p>Đầy đủ dữ liệu, giờ ngày theo múi giờ.</p>
        </div>
      </div>
      {content}
    </section>
  );
}
export function TaskFormPage({ modal = false }: { modal?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [generation, setGeneration] = useState(0);
  const query = useQuery({
    queryKey: ['tasks', 'detail', id],
    queryFn: async () => (await api<{ data: Task }>('/api/tasks/' + id)).data,
    enabled: !!id,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // Snapshot the revision being edited; refetches must not silently overwrite dirty fields.
  const [snapshot, setSnapshot] = useState<Task>();
  const close = () => {
    if (modal && location.state?.backgroundLocation) navigate(-1);
    else navigate(id ? '/tasks/' + id : '/tasks');
  };
  const reload = () => {
    void query.refetch().then((result) => {
      if (result.data) {
        setSnapshot(result.data);
        setGeneration((v) => v + 1);
      }
    });
  };
  if (id && query.isPending) return <LoadingState />;
  if (id && query.error && !snapshot)
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  return (
    <TaskForm
      key={(id ?? 'new') + ':' + generation}
      task={snapshot ?? query.data}
      onClose={close}
      modal={modal}
      reload={reload}
    />
  );
}
