import { useState } from 'react';
import { Puzzle } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { IconButton } from '../../../renderer/components/icon-button';
import { Modal } from '../../../renderer/components/modal';
import { browserClient } from '../../../renderer/client/browser-client';
import { useExtensions } from './use-extensions';
import { ExtensionPopupHost } from './extension-popup-host';
import './extensions.css';

export function ExtensionActions({ tab }: { tab?: TabSnapshot }) {
  const extensions = useExtensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const actions = extensions.extensions.filter(extension => extension.enabled && extension.status === 'loaded' && extension.hasAction);
  return <>
    <IconButton label="扩展" active={menuOpen} onClick={() => setMenuOpen(true)}><Puzzle size={18} /></IconButton>
    <Modal open={menuOpen} title="扩展" className="extension-dialog" onOpenChange={setMenuOpen}>
      {tab?.isPrivate ? <p>扩展不在私密窗口运行。</p> : !actions.length ? <p>当前没有可用的扩展操作。</p> :
        <ul className="extension-action-list">{actions.map(extension => <li key={extension.id}>
          <button disabled={extensions.pending || !tab} onClick={async () => {
            if (!tab) return;
            const result = await extensions.run(() => browserClient.command('extensions.openAction', { id: extension.id, tabId: tab.id }));
            if (result) { setMenuOpen(false); setPopupOpen(result.opened); }
          }}><Puzzle size={16} />{extension.name}</button>
        </li>)}</ul>}
      {extensions.error && <p role="alert">{extensions.error}</p>}
      <button onClick={() => {
        setMenuOpen(false);
        void extensions.run(() => browserClient.command('browser.openTab', { url: 'brave://extensions', active: true }));
      }}>管理扩展</button>
    </Modal>
    <ExtensionPopupHost open={popupOpen} onClose={() => setPopupOpen(false)} />
  </>;
}
