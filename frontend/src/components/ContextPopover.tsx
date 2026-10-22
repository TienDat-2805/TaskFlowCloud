import { useId, useSyncExternalStore, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { X } from 'lucide-react';
import { Button } from './ui';
const mediaQuery = '(max-width: 767px)';
const subscribe = (listener: () => void) => {
  const media = window.matchMedia?.(mediaQuery);
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
};
const mobileSnapshot = () => window.matchMedia?.(mediaQuery).matches ?? false;
export function ContextPopover({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  preventDismiss = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  preventDismiss?: boolean;
}) {
  const mobile = useSyncExternalStore(subscribe, mobileSnapshot, () => false);
  const id = useId();
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange} modal={mobile}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      {mobile && open && (
        <Popover.Portal>
          <div className="popover-backdrop" aria-hidden="true" />
        </Popover.Portal>
      )}
      <Popover.Portal>
        <Popover.Content
          className={'context-popover' + (mobile ? ' mobile-action-sheet' : '')}
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-labelledby={id + '-title'}
          aria-describedby={id + '-description'}
          onInteractOutside={(event) => {
            if (preventDismiss) event.preventDefault();
          }}
        >
          <div className="popover-heading">
            <div>
              <h2 id={id + '-title'}>{title}</h2>
              <p id={id + '-description'}>{description}</p>
            </div>
            <Popover.Close asChild>
              <Button variant="ghost" aria-label="Đóng bảng thao tác">
                <X size={18} />
              </Button>
            </Popover.Close>
          </div>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
