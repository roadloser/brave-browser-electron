import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { IconButton } from '../../../renderer/components/icon-button';
import { Modal } from '../../../renderer/components/modal';
import { VpnPanel } from './vpn-panel';

export function VpnButton() {
  const [open, setOpen] = useState(false);
  return <><IconButton label="Brave VPN" onClick={() => setOpen(true)}><ShieldCheck size={16}/></IconButton>
    <Modal open={open} onOpenChange={setOpen} title="Brave VPN"><VpnPanel/></Modal></>;
}
