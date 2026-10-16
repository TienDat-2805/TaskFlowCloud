import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { AlertCircle, CheckCheck, LoaderCircle, Plus, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TaskPriority, TaskStatus } from '../types';

const buttonVariants = cva('button', {
  variants: {
    variant: {
      primary: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      danger: 'button-danger',
    },
  },
  defaultVariants: { variant: 'primary' },
});
export function Button({
  className,
  variant,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant }), className)} {...props} />;
}
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('input', className)} {...props} />;
}
export function Field({
  label,
  error,
  children,
  htmlFor,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor: string;
  hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" role="alert" id={htmlFor + '-error'}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={cn('badge', 'priority-' + priority)}>
      <span className="badge-dot" />
      {{ low: 'Thấp', medium: 'Trung bình', high: 'Cao' }[priority]}
    </span>
  );
}
export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={cn('badge', status === 'completed' ? 'status-completed' : 'status-pending')}>
      {status === 'completed' ? 'Đã hoàn thành' : 'Chưa hoàn thành'}
    </span>
  );
}
export function LoadingState({ full = false }: { full?: boolean }) {
  return (
    <div className={cn('loading-state', full && 'full-state')} role="status" aria-label="Đang tải">
      <LoaderCircle className="animate-spin" size={26} />
      <span>Đang tải dữ liệu…</span>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="feedback-state" role="alert">
      <div className="feedback-icon error">
        <AlertCircle />
      </div>
      <h2>Chưa thể tải dữ liệu</h2>
      <p>{error.message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          <RefreshCw size={16} /> Thử lại
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  filtered = false,
  reset,
}: {
  filtered?: boolean;
  reset?: () => void;
}) {
  return (
    <div className="feedback-state">
      <div className="feedback-icon">
        <CheckCheck size={30} />
      </div>
      <h2>{filtered ? 'Không tìm thấy công việc' : 'Bắt đầu một ngày có kế hoạch'}</h2>
      <p>
        {filtered
          ? 'Thử thay đổi từ khóa hoặc bộ lọc để xem công việc khác.'
          : 'Tạo công việc đầu tiên và từng bước hoàn thành mục tiêu của bạn.'}
      </p>
      {filtered ? (
        <Button variant="secondary" onClick={reset}>
          Đặt lại bộ lọc
        </Button>
      ) : (
        <Button asChild>
          <Link to="/tasks/new">
            <Plus size={17} /> Tạo công việc đầu tiên
          </Link>
        </Button>
      )}
    </div>
  );
}
export function FormDialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="dialog-content">
          <div className="dialog-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description>{description}</DialogPrimitive.Description>
            </div>
            <Button variant="ghost" onClick={onClose} aria-label="Đóng biểu mẫu">
              <X size={20} />
            </Button>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function ConfirmDelete({
  title,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  title: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content confirm-dialog">
          <div className="feedback-icon error">
            <AlertCircle />
          </div>
          <AlertDialog.Title>Xóa công việc?</AlertDialog.Title>
          <AlertDialog.Description>
            Công việc “{title}” sẽ bị xóa vĩnh viễn. Bạn không thể hoàn tác thao tác này.
          </AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                Hủy
              </Button>
            </AlertDialog.Cancel>
            <Button variant="danger" onClick={onConfirm} disabled={pending}>
              {pending && <LoaderCircle size={16} className="animate-spin" />} Xóa công việc
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
