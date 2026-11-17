import { Video } from 'lucide-react';
import { browserClient } from '../../../renderer/client/browser-client';
import { IconButton } from '../../../renderer/components/icon-button';
import { useBrowserStore } from '../../../renderer/shell/browser-store';

export function TalkButton() {
  const snapshot = useBrowserStore((state) => state.snapshot);
  const current = snapshot?.windows.find((window) => window.id === snapshot.currentWindowId);
  const tab = current?.tabs.find((entry) => entry.id === current.layout.sidebarTabId);
  const active = Boolean(tab?.url.startsWith('https://talk.brave.com'));
  return (
    <IconButton label={active ? '关闭 Brave Talk 侧栏' : 'Brave Talk'} active={active}
      onClick={() => browserClient.command('talk.toggle', {}).catch(useBrowserStore.getState().reportError)}><Video size={18} /></IconButton>
  );
}

export function TalkPanel() {
  return <div className="talk-panel"><h2>Brave Talk</h2><p>在独立网页侧栏中使用官方通话服务。</p><TalkButton /></div>;
}
