import { Columns2, X } from 'lucide-react';
import type { WindowSnapshot } from '../../shared/contracts/browser-core';
import { IconButton } from '../components/icon-button';
import { useBrowserCommand } from './use-browser-command';

export function SplitControls({ currentWindow }: { currentWindow: WindowSnapshot }) {
  const command = useBrowserCommand();
  if (currentWindow.layout.splitTabIds.length < 2) return null;
  return (
    <div className="split-controls">
      <Columns2 size={15} /><span>分屏</span>
      <input type="range" min="15" max="85" aria-label="分屏比例"
        value={Math.round(currentWindow.layout.splitRatio * 100)}
        onChange={(event) => void command('browser.setLayout', { splitRatio: Number(event.target.value) / 100 })} />
      <IconButton label="退出分屏" onClick={() => void command('browser.setLayout', { splitTabIds: [] })}><X size={14} /></IconButton>
    </div>
  );
}
