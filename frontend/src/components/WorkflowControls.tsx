import { useRef, useState, type ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import type { Task, TaskStatus, TaskPriority } from '../types';
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
import { Button, Field, FormDialog, Input } from './ui';

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
  const { enabled } = useWorkflow();
  const values = Object.entries(statuses).filter(([key]) => enabled || key !== 'in_progress') as [
    TaskStatus,
    string,
  ][];
  return (
    <Choices
      label="Trạng thái"
      value={value}
      values={values}
      onChange={onChange}
      disabled={disabled}
    />
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
}: {
  value: DeadlineValues;
  onChange: (v: DeadlineValues) => void;
}) {
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
          <Field label="Ngày hết hạn" htmlFor="due-date">
            <Input
              id="due-date"
              type="date"
              required
              value={value.date}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </Field>
          <Field label="Múi giờ" htmlFor="due-zone">
            <Input
              id="due-zone"
              list="time-zones"
              required
              value={value.timeZone}
              onChange={(e) => onChange({ ...value, timeZone: e.target.value })}
            />
            <datalist id="time-zones">
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
          htmlFor="due-at"
          hint={'Múi giờ trên thiết bị: ' + timeZone()}
        >
          <Input
            id="due-at"
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
export function QuickAdd() {
  const submitting = useRef(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: (name: string) =>
      api('/api/tasks', {
        method: 'POST',
        body: body({ title: name, priority, due: { mode: 'none' } }),
      }),
    onSuccess: async () => {
      setTitle('');
      toast.success('Đã tạo công việc');
      await refreshTasks(client);
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  return (
    <form
      className="surface quick-add"
      aria-label="Tạo nhanh công việc"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && !submitting.current) {
          submitting.current = true;
          create.mutate(title.trim());
        }
      }}
    >
      <Plus size={16} />
      <Input
        aria-label="Tên công việc tạo nhanh"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nhập công việc mới và nhấn Enter…"
        disabled={create.isPending}
        required
      />
      <select
        aria-label="Ưu tiên tạo nhanh"
        className="quick-priority"
        value={priority}
        onChange={(e) => setPriority(e.target.value as TaskPriority)}
        disabled={create.isPending}
      >
        {Object.entries(priorities).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <span className="quick-no-due">Không thời hạn</span>
      <Button disabled={create.isPending || !title.trim()}>
        {create.isPending ? 'Đang tạo…' : 'Thêm ↵'}
      </Button>
      {create.error && (
        <p role="alert" className="field-error">
          {create.error.message}
        </p>
      )}
    </form>
  );
}
export function QuickEdit({
  task,
  onClose,
  anchor,
}: {
  task: Task;
  onClose: () => void;
  anchor: { top: number; left: number };
}) {
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [deadline, setDeadline] = useState(deadlineValues(task));
  const [error, setError] = useState('');
  const mutation = useTaskMutation();
  const client = useQueryClient();
  const location = useLocation();
  const { enabled } = useWorkflow();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deletion = useMutation({
    mutationFn: () =>
      api('/api/tasks/' + task.id, {
        method: 'DELETE',
        body: body({ expectedRevision: task.revision }),
      }),
    onSuccess: async () => {
      setConfirmDelete(false);
      onClose();
      await refreshTasks(client);
      toast.success(enabled ? 'Đã chuyển vào thùng rác' : 'Đã xóa công việc');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <FormDialog
      title="Sửa nhanh công việc"
      description={task.title}
      contentClassName="quick-edit-dialog"
      style={anchor}
      onClose={() => {
        if (!mutation.isPending && !deletion.isPending) onClose();
      }}
    >
      <form
        className="task-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setError('');
            const due = deadlinePayload(deadline);
            mutation.mutate({ task, values: { priority, status, due } }, { onSuccess: onClose });
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <StatusChoices value={status} onChange={setStatus} disabled={mutation.isPending} />
        <PriorityChoices value={priority} onChange={setPriority} disabled={mutation.isPending} />
        <DeadlineFields value={deadline} onChange={setDeadline} />
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
          onClick={() => setConfirmDelete(true)}
        >
          Xóa công việc
        </button>
      </div>
      <ConfirmAction
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={enabled ? 'Chuyển vào thùng rác?' : 'Xóa công việc?'}
        description={
          enabled ? 'Bạn có thể khôi phục trong tối đa 30 ngày.' : 'Công việc sẽ bị xóa vĩnh viễn.'
        }
        action={enabled ? 'Chuyển vào thùng rác' : 'Xóa công việc'}
        onConfirm={() => deletion.mutate()}
        pending={deletion.isPending}
      />
      <ConflictNotice
        error={deletion.error}
        reload={() => {
          void refreshTasks(client);
          onClose();
        }}
      />
    </FormDialog>
  );
}
