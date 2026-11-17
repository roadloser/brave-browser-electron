import { Fragment } from 'react';
import { Plus } from 'lucide-react';
import type { WindowSnapshot } from '../../shared/contracts/browser-core';
import type { TabGroupsState } from '../../shared/contracts/tab-groups';
import { GroupHeader } from '../../features/tab-groups/renderer/group-header';
import { IconButton } from '../components/icon-button';
import { TabItem } from './tab-item';
import { useBrowserCommand } from './use-browser-command';

export function TabStrip({ currentWindow, groups, vertical = false }: {
  currentWindow: WindowSnapshot;
  groups: TabGroupsState;
  vertical?: boolean;
}) {
  const command = useBrowserCommand();
  const groupsByTab = new Map(groups.groups.flatMap((group) => group.tabIds.map((tabId) => [tabId, group] as const)));
  const rendered = new Set<string>();
  return (
    <div className={vertical ? 'vertical-tab-list' : 'horizontal-tab-list'} role="tablist" aria-label="打开的标签页"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}>
      {currentWindow.tabs.map((tab) => {
        const group = groupsByTab.get(tab.id);
        if (!group) return <TabItem key={tab.id} tab={tab} currentWindow={currentWindow} groups={groups.groups} vertical={vertical} />;
        if (rendered.has(group.id)) return null;
        rendered.add(group.id);
        return (
          <Fragment key={group.id}>
            <GroupHeader group={group} vertical={vertical} />
            {!group.collapsed && currentWindow.tabs.filter((entry) => group.tabIds.includes(entry.id)).map((member) => (
              <TabItem key={member.id} tab={member} currentWindow={currentWindow} groups={groups.groups} vertical={vertical} />
            ))}
          </Fragment>
        );
      })}
      <IconButton label="新建标签页" className="new-tab-button" onClick={() => void command('browser.openTab', {})}><Plus size={17} /></IconButton>
    </div>
  );
}
