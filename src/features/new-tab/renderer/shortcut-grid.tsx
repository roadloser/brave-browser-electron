import { useState } from 'react';
import { Globe, MoreHorizontal, Plus } from 'lucide-react';
import type { NewTabState, Shortcut } from '../../../shared/contracts/new-tab';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { IconButton } from '../../../renderer/components/icon-button';

export function ShortcutGrid({ shortcuts, tabId, onState, onError }: {
  shortcuts: Shortcut[]; tabId: string; onState: (state: NewTabState) => void; onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Shortcut | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function edit(shortcut: Shortcut | 'new') {
    setEditing(shortcut); setTitle(shortcut === 'new' ? '' : shortcut.title); setUrl(shortcut === 'new' ? '' : shortcut.url); setError('');
  }
  async function save() {
    setBusy(true); setError('');
    try {
      const state = editing === 'new' ? await browserClient.command('newTab.addShortcut', { title, url }) :
        await browserClient.command('newTab.updateShortcut', { id: (editing as Shortcut).id, title, url });
      onState(state); setEditing(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!editing || editing === 'new') return;
    setBusy(true);
    try { onState(await browserClient.command('newTab.removeShortcut', { id: editing.id })); setEditing(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  return (
    <>
      <div className="shortcut-grid">
        {shortcuts.map((shortcut, index) => (
          <div className="shortcut-item" key={shortcut.id} draggable
            onDragStart={(event) => event.dataTransfer.setData('application/x-brave-shortcut', shortcut.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('application/x-brave-shortcut');
              if (id) browserClient.command('newTab.moveShortcut', { id, index }).then(onState).catch((failure) => onError(String(failure)));
            }}>
            <button className="shortcut-link" type="button" onClick={() => browserClient.command('browser.navigate', { tabId, url: shortcut.url }).catch((failure) => onError(String(failure)))}>
              <span className="shortcut-icon"><Globe size={25} /></span><span>{shortcut.title}</span>
            </button>
            <IconButton className="shortcut-edit" label={`编辑 ${shortcut.title}`} onClick={() => edit(shortcut)}><MoreHorizontal size={16} /></IconButton>
          </div>
        ))}
        <button type="button" className="shortcut-link shortcut-add" onClick={() => edit('new')}>
          <span className="shortcut-icon"><Plus size={24} /></span><span>添加快捷项</span>
        </button>
      </div>
      <Modal open={editing !== null} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }} title={editing === 'new' ? '添加快捷项' : '编辑快捷项'}>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label className="form-field"><span>名称</span><input required maxLength={128} value={title} autoFocus onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="form-field"><span>网址</span><input required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" /></label>
          {error && <ErrorNotice message={error} />}
          <div className="form-actions">
            {editing !== 'new' && <button className="button button-danger" type="button" disabled={busy} onClick={() => void remove()}>删除</button>}
            <button className="button" type="button" disabled={busy} onClick={() => setEditing(null)}>取消</button>
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? '保存中…' : '保存'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
