import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { DueInput, Task, TaskStatus, TaskPriority } from '../types';
import { api, ApiError, body } from '../lib/api';
import {
  deadlinePayload,
  deadlineValues,
  priorities,
  statuses,
  timeZone,
  type DeadlineValues,
} from '../lib/workflow';
import { refreshTasks, useTaskMutation } from '../features/tasks';
import { useWorkflow } from '../features/workflow';
import { Button, Field, Input } from './ui';
import { ContextPopover } from './ContextPopover';

export function Choices<T extends string>({
  label,
  value,
  values,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  values: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="choice-field" disabled={disabled}>
      <legend>{label}</legend>
      <div className="choice-group">
        {values.map(([item, text]) => (
          <button
            key={item}
            type="button"
            className={'choice choice-' + item}
            aria-pressed={value === item}
            onClick={() => onChange(item)}
          >
            {text}
            {value === item && ' ✓'}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function StatusChoices({
  value,
  onChange,
  disabled,
}: {
  value: TaskStatus;
  onChange: (v: TaskStatus) => void;
  disabled?: boolean;
}) {
  const { enabled, ready, error, retry } = useWorkflow();
  const values = Object.entries(statuses).filter(
    ([key]) => enabled !== false || key !== 'in_progress',
  ) as [TaskStatus, string][];
  return (
    <>
      <Choices
        label="Trạng thái"
        value={value}
        values={values}
        onChange={onChange}
        disabled={disabled || !ready}
      />
      {error && (
        <div className="capability-notice" role="alert">
          <p>Chưa thể cập nhật cấu hình trạng thái.</p>
          <Button type="button" variant="secondary" onClick={() => void retry()}>
            Thử lại tính năng
          </Button>
        </div>
      )}
    </>
  );
}
export function PriorityChoices({
  value,
  onChange,
  disabled,
}: {
  value: TaskPriority;
  onChange: (v: TaskPriority) => void;
  disabled?: boolean;
}) {
  return (
    <Choices
      label="Mức độ ưu tiên"
      value={value}
      values={Object.entries(priorities) as [TaskPriority, string][]}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
export function DeadlineFields({
  value,
  onChange,
  idPrefix,
}: {
  value: DeadlineValues;
  onChange: (v: DeadlineValues) => void;
  idPrefix?: string;
}) {
  const generatedId = useId();
  const prefix = idPrefix ?? generatedId;
  return (
    <div className="deadline-fields">
      <Choices
        label="Loại deadline"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        values={[
          ['none', 'Không hạn'],
          ['date', 'Chỉ ngày'],
          ['datetime', 'Ngày + giờ'],
        ]}
      />
      {value.mode === 'date' && (
        <div className="form-row">
          <Field label="Ngày hết hạn" htmlFor={prefix + '-date'}>
            <Input
              id={prefix + '-date'}
              type="date"
              required
              value={value.date}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </Field>
          <Field label="Múi giờ" htmlFor={prefix + '-zone'}>
            <Input
              id={prefix + '-zone'}
              list={prefix + '-zones'}
              required
              value={value.timeZone}
              onChange={(e) => onChange({ ...value, timeZone: e.target.value })}
            />
            <datalist id={prefix + '-zones'}>
              <option value={timeZone()} />
              <option value="Asia/Ho_Chi_Minh" />
              <option value="UTC" />
              <option value="America/New_York" />
            </datalist>
          </Field>
        </div>
      )}
      {value.mode === 'datetime' && (
        <Field
          label="Ngày và giờ hết hạn"
          htmlFor={prefix + '-at'}
          hint={'Múi giờ trên thiết bị: ' + timeZone()}
        >
          <Input
            id={prefix + '-at'}
            type="datetime-local"
            required
            value={value.at}
            onChange={(e) => onChange({ ...value, at: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}
export function ConflictNotice({ error, reload }: { error: Error | null; reload: () => void }) {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  return (
    <div className="conflict-notice" role="alert">
      <strong>Công việc đã thay đổi ở nơi khác</strong>
      <p>Để tránh ghi đè, vui lòng tải bản cập nhật mới nhất.</p>
      <Button variant="secondary" onClick={reload}>
        Tải lại dữ liệu
      </Button>
    </div>
  );
}
export function ConfirmAction({
  open,
  onOpenChange,
  title,
  description,
  action,
  onConfirm,
  pending = false,
  confirmationText,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: ReactNode;
  action: string;
  onConfirm: () => void;
  pending?: boolean;
  confirmationText?: string;
}) {
  const [typed, setTyped] = useState('');
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!pending) {
          setTyped('');
          onOpenChange(v);
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content confirm-dialog">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
          {confirmationText && (
            <Field label="Nhập tên công việc để xác nhận" htmlFor="confirm-name">
              <Input
                id="confirm-name"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </Field>
          )}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                Hủy
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="danger"
              disabled={pending || (!!confirmationText && typed !== confirmationText)}
              onClick={onConfirm}
            >
              {pending ? 'Đang xử lý…' : action}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function QuickDeadline({
  value,
  onChange,
  disabled,
}: {
  value: DeadlineValues;
  onChange: (value: DeadlineValues) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  return (
    <ContextPopover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(value);
          setError('');
        }
        setOpen(next);
      }}
      trigger={
        <button
          type="button"
          className="quick-deadline"
          aria-label="Thời hạn tạo nhanh"
          disabled={disabled}
        >
          {value.mode === 'none'
            ? 'Không hạn'
            : value.mode === 'date'
              ? value.date
              : 'Có ngày và giờ'}
        </button>
      }
      title="Thời hạn tạo nhanh"
      description="Chọn deadline trước khi tạo công việc."
    >
      <form
        className="popover-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            deadlinePayload(draft);
            onChange(draft);
            setOpen(false);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <DeadlineFields value={draft} onChange={setDraft} />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button>Áp dụng thời hạn</Button>
        </div>
      </form>
    </ContextPopover>
  );
}
export function QuickAdd() {
  const submitting = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [deadline, setDeadline] = useState(deadlineValues());
  const [error, setError] = useState('');
  const client = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: ({ name, due }: { name: string; due: DueInput }) =>
      api<{ data: Task }>('/api/tasks', {
        method: 'POST',
        body: body({ title: name, priority, due }),
      }),
    onSuccess: async (result) => {
      setTitle('');
      toast.success('Đã tạo công việc', {
        duration: 6000,
        action: { label: 'Xem công việc', onClick: () => navigate('/tasks/' + result.data.id) },
      });
      await refreshTasks(client);
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  useEffect(() => {
    if (create.isSuccess && !create.isPending) input.current?.focus();
  }, [create.isSuccess, create.isPending]);
  return (
    <form
      className="surface quick-add"
      aria-label="Tạo nhanh công việc"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || submitting.current) return;
        try {
          const due = deadlinePayload(deadline);
          setError('');
          submitting.current = true;
          create.mutate({ name: title.trim(), due });
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <Plus size={16} />
      <Input
        ref={input}
        aria-label="Tên công việc tạo nhanh"
        maxLength={120}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Nhập công việc mới và nhấn Enter…"
        disabled={create.isPending}
        required
      />
      <div className="quick-add-options">
        <select
          aria-label="Ưu tiên tạo nhanh"
          className="quick-priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as TaskPriority)}
          disabled={create.isPending}
        >
          {Object.entries(priorities).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <QuickDeadline value={deadline} onChange={setDeadline} disabled={create.isPending} />
        <Button disabled={create.isPending || !title.trim()}>
          {create.isPending ? 'Đang tạo…' : 'Thêm ↵'}
        </Button>
      </div>
      {(error || create.error) && (
        <p role="alert" className="field-error">
          {error || create.error?.message}
        </p>
      )}
    </form>
  );
}
function QuickEditForm({
  task: source,
  onClose,
  onConfirmChange,
}: {
  task: Task;
  onClose: () => void;
  onConfirmChange: (open: boolean) => void;
}) {
  const [task] = useState(source);
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [deadline, setDeadline] = useState(deadlineValues(task));
  const [error, setError] = useState('');
  const mutation = useTaskMutation();
  const client = useQueryClient();
  const location = useLocation();
  const { enabled, ready } = useWorkflow();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deletion = useMutation({
    mutationFn: () => {
      if (!ready) throw new Error('Vui lòng tải lại cấu hình tính năng trước khi xóa.');
      return api('/api/tasks/' + task.id, {
        method: 'DELETE',
        body: body({ expectedRevision: task.revision }),
      });
    },
    onSuccess: async () => {
      setConfirmDelete(false);
      onConfirmChange(false);
      onClose();
      await refreshTasks(client);
      toast.success(enabled ? 'Đã chuyển vào thùng rác' : 'Đã xóa công việc');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <>
      <form
        className="popover-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (mutation.isPending) return;
          try {
            setError('');
            const due = deadlinePayload(deadline);
            mutation.mutate({ task, values: { priority, status, due } }, { onSuccess: onClose });
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <fieldset disabled={mutation.isPending || deletion.isPending}>
          <StatusChoices value={status} onChange={setStatus} />
          <PriorityChoices value={priority} onChange={setPriority} />
          <DeadlineFields value={deadline} onChange={setDeadline} />
        </fieldset>
        {(error || mutation.error) && (
          <p className="field-error" role="alert">
            {error || mutation.error?.message}
          </p>
        )}
        <ConflictNotice
          error={mutation.error}
          reload={() => {
            void refreshTasks(client);
            onClose();
          }}
        />
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button disabled={mutation.isPending}>Lưu thay đổi</Button>
        </div>
      </form>
      <div className="quick-edit-links">
        <Link
          className="text-link"
          to={'/tasks/' + task.id + '/edit'}
          state={{ backgroundLocation: location }}
          onClick={onClose}
        >
          Mở biểu mẫu đầy đủ →
        </Link>
        <button
          type="button"
          className="text-link danger-text"
          disabled={!ready || mutation.isPending}
          onClick={() => {
            setConfirmDelete(true);
            onConfirmChange(true);
          }}
        >
          Xóa công việc
        </button>
      </div>
      <ConfirmAction
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open);
          onConfirmChange(open);
        }}
        title={enabled ? 'Chuyển vào thùng rác?' : 'Xóa công việc?'}
        description={
          enabled ? 'Bạn có thể khôi phục trong tối đa 30 ngày.' : 'Công việc sẽ bị xóa vĩnh viễn.'
        }
        action={enabled ? 'Chuyển vào thùng rác' : 'Xóa công việc'}
        onConfirm={() => deletion.mutate()}
        pending={deletion.isPending || !ready}
      />
      <ConflictNotice
        error={deletion.error}
        reload={() => {
          void refreshTasks(client);
          onClose();
        }}
      />
    </>
  );
}
export function QuickEdit({ task, trigger }: { task: Task; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <ContextPopover
      open={open}
      onOpenChange={(next) => {
        if (!confirming) setOpen(next);
      }}
      trigger={trigger}
      title="Sửa nhanh công việc"
      description={task.title}
      preventDismiss={confirming}
    >
      {open && (
        <QuickEditForm task={task} onClose={() => setOpen(false)} onConfirmChange={setConfirming} />
      )}
    </ContextPopover>
  );
}
