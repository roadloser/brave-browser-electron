import { useState } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { TabGroup } from '../../../shared/contracts/tab-groups';
import { browserClient } from '../../../renderer/client/browser-client';
import { IconButton } from '../../../renderer/components/icon-button';
import { useBrowserStore } from '../../../renderer/shell/browser-store';
import { GroupMenu } from './group-menu';

export function GroupHeader({ group, vertical = false }: { group: TabGroup; vertical?: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`group-header ${vertical ? 'is-vertical' : ''}`} data-group-color={group.color}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const tabId = event.dataTransfer.getData('application/x-brave-tab');
        if (tabId) browserClient.command('tabGroups.moveTab', { tabId, groupId: group.id })
          .catch(useBrowserStore.getState().reportError);
      }}>
      <button className="group-toggle" type="button" aria-expanded={!group.collapsed}
        title={`${group.name || '未命名标签组'}，${group.tabIds.length} 个标签页`}
        onContextMenu={(event) => { event.preventDefault(); setEditing(true); }}
        onClick={() => browserClient.command('tabGroups.update', { groupId: group.id, collapsed: !group.collapsed })
          .catch(useBrowserStore.getState().reportError)}>
        {group.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span>{group.name || `${group.tabIds.length} 个标签页`}</span>
      </button>
      <IconButton label="编辑标签组" onClick={() => setEditing(true)}><MoreHorizontal size={14} /></IconButton>
      <GroupMenu group={group} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
