import { useState, type DragEvent } from 'react';
import { ContextMenu as Menu } from '@base-ui/react/context-menu';
import { Copy, Globe, LoaderCircle, Pin, SplitSquareHorizontal, Volume2, VolumeX, X } from 'lucide-react';
import type { TabSnapshot, WindowSnapshot } from '../../shared/contracts/browser-core';
import type { TabGroup } from '../../shared/contracts/tab-groups';
import { useBrowserCommand } from './use-browser-command';
import { usePageOverlay } from './use-page-overlay';

export function TabItem({ tab, currentWindow, groups, vertical = false }: {
  tab: TabSnapshot;
  currentWindow: WindowSnapshot;
  groups: TabGroup[];
  vertical?: boolean;
}) {
  const command = useBrowserCommand();
  const [menuOpen, setMenuOpen] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  usePageOverlay(menuOpen);
  const active = currentWindow.activeTabId === tab.id;
  const group = groups.find((entry) => entry.tabIds.includes(tab.id));
  const tabIndex = currentWindow.tabs.findIndex((entry) => entry.id === tab.id);

  function drop(event: DragEvent) {
    event.preventDefault();
    const dragged = event.dataTransfer.getData('application/x-brave-tab');
    if (!dragged || dragged === tab.id) return;
    if (currentWindow.tabs.find((entry) => entry.id === dragged)?.pinned) {
      void command('browser.moveTab', { tabId: dragged, index: tabIndex });
      return;
    }
    void command('tabGroups.moveTab', { tabId: dragged, groupId: group?.id ?? null, index: tabIndex });
  }
  function split() {
    const selected = currentWindow.activeTabId;
    if (selected && selected !== tab.id) {
      void command('browser.setLayout', { splitTabIds: [selected, tab.id] });
    }
  }

  return (
    <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Menu.Trigger
        render={<div />}
        className={`browser-tab ${vertical ? 'is-vertical' : ''}`}
        data-active={active} data-pinned={tab.pinned} data-group-color={group?.color}
        role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
        title={tab.title || tab.url} draggable
        onDragStart={(event) => event.dataTransfer.setData('application/x-brave-tab', tab.id)}
        onDragOver={(event) => event.preventDefault()} onDrop={drop}
        onClick={(event) => { event.preventDefault(); void command('browser.selectTab', { tabId: tab.id }); }}
        onAuxClick={(event) => { if (event.button === 1) void command('browser.closeTab', { tabId: tab.id }); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void command('browser.selectTab', { tabId: tab.id });
          }
        }}>
        <span className="tab-favicon">
          {tab.loading ? <LoaderCircle size={15} className="spinning" /> :
            tab.faviconUrl && !faviconFailed ?
              <img src={tab.faviconUrl} alt="" onError={() => setFaviconFailed(true)} /> : <Globe size={15} />}
        </span>
        {(!tab.pinned || vertical) && <span className="tab-title">{tab.title || '新标签页'}</span>}
        {tab.muted || tab.audible ? (
          <button type="button" className="tab-action" title={tab.muted ? '取消静音' : '静音'}
            aria-label={tab.muted ? '取消静音' : '静音'}
            onClick={(event) => { event.stopPropagation(); void command('browser.muteTab', { tabId: tab.id, muted: !tab.muted }); }}>
            {tab.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        ) : null}
        {(!tab.pinned || vertical) && (
          <button type="button" className="tab-action tab-close" aria-label={`关闭 ${tab.title || '标签页'}`}
            onClick={(event) => { event.stopPropagation(); void command('browser.closeTab', { tabId: tab.id }); }}>
            <X size={13} />
          </button>
        )}
      </Menu.Trigger>
      <Menu.Portal><Menu.Positioner side="bottom" align="start" sideOffset={4}>
        <Menu.Popup className="browser-menu">
          <Menu.Item onClick={() => void command('browser.duplicateTab', { tabId: tab.id })}><Copy size={15} />复制标签页</Menu.Item>
          <Menu.Item onClick={() => void command('browser.pinTab', { tabId: tab.id, pinned: !tab.pinned })}><Pin size={15} />{tab.pinned ? '取消固定' : '固定标签页'}</Menu.Item>
          <Menu.Item onClick={() => void command('browser.muteTab', { tabId: tab.id, muted: !tab.muted })}><VolumeX size={15} />{tab.muted ? '取消静音' : '静音'}</Menu.Item>
          <Menu.Item disabled={active} onClick={split}><SplitSquareHorizontal size={15} />与当前标签分屏</Menu.Item>
          <Menu.Separator className="menu-separator" />
          <Menu.Item disabled={tab.pinned} onClick={() => void command('tabGroups.create', { name: '', color: 'blue', tabIds: [tab.id] })}>添加到新标签组</Menu.Item>
          {groups.filter((entry) => entry.id !== group?.id).map((entry) => (
            <Menu.Item key={entry.id} disabled={tab.pinned}
              onClick={() => void command('tabGroups.moveTab', { tabId: tab.id, groupId: entry.id })}>
              <span className="group-dot" data-group-color={entry.color} />{entry.name || '未命名标签组'}
            </Menu.Item>
          ))}
          {group && <Menu.Item onClick={() => void command('tabGroups.moveTab', { tabId: tab.id, groupId: null })}>移出标签组</Menu.Item>}
          <Menu.Separator className="menu-separator" />
          <Menu.Item onClick={() => void command('browser.closeTab', { tabId: tab.id })}><X size={15} />关闭标签页</Menu.Item>
        </Menu.Popup>
      </Menu.Positioner></Menu.Portal>
    </Menu.Root>
  );
}
