import { useState } from 'react';
import { Puzzle } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import { IconButton } from '../../../renderer/components/icon-button';
import { Modal } from '../../../renderer/components/modal';
import { browserClient } from '../../../renderer/client/browser-client';
import { useExtensions } from './use-extensions';
import { ExtensionPopupHost } from './extension-popup-host';
import { useExtensionActions } from './use-extension-actions';
import './extensions.css';

export function ExtensionActions({ tab }: { tab?: TabSnapshot }) {
  const extensions = useExtensions();
  const dynamic = useExtensionActions(tab?.id);
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
          }} title={dynamic.actions.find(action => action.id === extension.id)?.title || extension.name}>
            {dynamic.actions.find(action => action.id === extension.id)?.iconDataUrl
              ? <img src={dynamic.actions.find(action => action.id === extension.id)?.iconDataUrl} alt="" width={20} height={20} />
              : <Puzzle size={16} />}
            {dynamic.actions.find(action => action.id === extension.id)?.title || extension.name}
            {dynamic.actions.find(action => action.id === extension.id)?.badgeText && <span className="extension-action-badge"
              style={{ backgroundColor: dynamic.actions.find(action => action.id === extension.id)?.badgeColor }}>
              {dynamic.actions.find(action => action.id === extension.id)?.badgeText}
            </span>}
          </button>
        </li>)}</ul>}
      {extensions.error && <p role="alert">{extensions.error}</p>}
      {dynamic.error && <p role="alert">{dynamic.error}</p>}
      <button onClick={() => {
        setMenuOpen(false);
        void extensions.run(() => browserClient.command('browser.openTab', { url: 'brave://extensions', active: true }));
      }}>管理扩展</button>
    </Modal>
    <ExtensionPopupHost open={popupOpen} onClose={() => setPopupOpen(false)} />
  </>;
}
