import { AlertCircle, X } from 'lucide-react';
import { IconButton } from './icon-button';

export function ErrorNotice({ message, onDismiss, onRetry }: {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={17} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry}>重试</button>}
      {onDismiss && <IconButton label="关闭提示" onClick={onDismiss}><X size={15} /></IconButton>}
    </div>
  );
}
