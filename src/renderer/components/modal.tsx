import { Dialog } from '@base-ui/react/dialog';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { usePageOverlay } from '../shell/use-page-overlay';
import { IconButton } from './icon-button';

export function Modal({ open, onOpenChange, title, children, className = '' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  usePageOverlay(open);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup className={`modal-popup ${className}`}>
          <header className="modal-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close render={<IconButton label="关闭" />}><X size={18} /></Dialog.Close>
          </header>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
