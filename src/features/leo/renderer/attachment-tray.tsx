import { X } from 'lucide-react';
import type { LeoAttachment } from '../../../shared/contracts/leo';
import { IconButton } from '../../../renderer/components/icon-button';

export function AttachmentTray({ attachments, onRemove }: { attachments: LeoAttachment[]; onRemove?: (id: string) => void }) {
  if (!attachments.length) return null;
  return <div className="leo-attachments">{attachments.map((attachment) => <div key={attachment.id}>
    <img src={attachment.dataUrl} alt={attachment.name} title={attachment.name} />
    {onRemove && <IconButton label={`移除图片 ${attachment.name}`} onClick={() => onRemove(attachment.id)}><X size={13} /></IconButton>}
  </div>)}</div>;
}
