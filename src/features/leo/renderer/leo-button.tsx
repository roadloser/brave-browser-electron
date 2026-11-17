import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { IconButton } from '../../../renderer/components/icon-button';
import { LeoPanel } from './leo-panel';

export function LeoButton({ tab }: { tab?: TabSnapshot }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Leo" disabled={!tab} active={open} onClick={() => setOpen((value) => !value)}><Sparkles size={18} /></IconButton>
      {tab && <LeoPanel tab={tab} open={open} onOpenChange={setOpen} />}
    </>
  );
}
