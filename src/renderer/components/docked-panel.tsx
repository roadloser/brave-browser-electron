import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './icon-button';

export function DockedPanel({ open, onOpenChange, title, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.getElementById('browser-feature-panel-host')); }, [open]);
  if (!open || !host) return null;
  return createPortal(
    <aside className="docked-panel" aria-label={title}>
      <header className="docked-panel-header"><h2>{title}</h2><IconButton label={`关闭${title}`} onClick={() => onOpenChange(false)}><X size={18} /></IconButton></header>
      <div className="docked-panel-content">{children}</div>
    </aside>, host,
  );
}
