import { PanelLeftClose } from 'lucide-react';
import type { WindowSnapshot } from '../../shared/contracts/browser-core';
import type { TabGroupsState } from '../../shared/contracts/tab-groups';
import { IconButton } from '../components/icon-button';
import { TabStrip } from './tab-strip';
import { useBrowserCommand } from './use-browser-command';

export function VerticalTabStrip({ currentWindow, groups }: { currentWindow: WindowSnapshot; groups: TabGroupsState }) {
  const command = useBrowserCommand();
  return (
    <aside className="vertical-tabs">
      <header><span>标签页</span><IconButton label="改用横向标签页"
        onClick={() => void command('browser.setLayout', { verticalTabs: false })}><PanelLeftClose size={17} /></IconButton></header>
      <TabStrip currentWindow={currentWindow} groups={groups} vertical />
    </aside>
  );
}
