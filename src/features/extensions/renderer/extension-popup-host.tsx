import { useEffect } from 'react';
import { browserClient } from '../../../renderer/client/browser-client';

export function ExtensionPopupHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void browserClient.command('extensions.closeAction', {}).finally(onClose);
    };
    window.addEventListener('keydown', keyboard);
    return () => { window.removeEventListener('keydown', keyboard); void browserClient.command('extensions.closeAction', {}).catch(() => undefined); };
  }, [open]);
  if (!open) return null;
  return <button className="extension-popup-dismiss" aria-label="关闭扩展弹出页面" onClick={() => void browserClient.command('extensions.closeAction', {}).finally(onClose)}>关闭扩展面板</button>;
}
