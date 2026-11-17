import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { Modal } from '../../../renderer/components/modal';
import { IconButton } from '../../../renderer/components/icon-button';
import { SitePermissionPanel } from './site-permission-panel';

export function SitePermissionButton({ tab }: { tab?: TabSnapshot }) {
  const [open, setOpen] = useState(false);
  let origin: string | undefined;
  try { const url = new URL(tab?.url ?? ''); if (['https:', 'http:'].includes(url.protocol)) origin = url.origin; } catch { origin = undefined; }
  return <><IconButton label="网站权限与数据" disabled={!origin} onClick={() => setOpen(true)}><LockKeyhole size={16}/></IconButton>
    <Modal open={open && !!origin} onOpenChange={setOpen} title="网站权限与数据"><SitePermissionPanel origin={origin}/></Modal>
  </>;
}
