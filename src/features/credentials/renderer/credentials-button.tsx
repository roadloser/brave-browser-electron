import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { Modal } from '../../../renderer/components/modal';
import { IconButton } from '../../../renderer/components/icon-button';
import { CredentialsPage } from './credentials-page';

export function CredentialsButton({ tab }: { tab?: TabSnapshot }) {
  const [open, setOpen] = useState(false);
  const available = !!tab && /^https?:/.test(tab.url);
  return <><IconButton label="密码与填充" disabled={!available} onClick={() => setOpen(true)}><KeyRound size={16}/></IconButton>
    <Modal open={open && available} onOpenChange={setOpen} title="密码与填充"><CredentialsPage tabId={tab?.id}/></Modal>
  </>;
}
