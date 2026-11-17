import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Plus, UserRound, VenetianMask } from 'lucide-react';
import { browserClient } from '../client/browser-client';
import { IconButton } from '../components/icon-button';
import { Modal } from '../components/modal';
import { ErrorNotice } from '../components/error-notice';
import { useBrowserStore } from './browser-store';
import { useBrowserCommand } from './use-browser-command';
import { usePageOverlay } from './use-page-overlay';

export function ProfileMenu() {
  const snapshot = useBrowserStore((state) => state.snapshot);
  const current = snapshot?.windows.find((entry) => entry.id === snapshot.currentWindowId);
  const profile = snapshot?.profiles.find((entry) => entry.id === current?.profileId);
  const command = useBrowserCommand();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  usePageOverlay(open);
  const showDialog = (mode: 'create' | 'rename' | 'delete') => {
    setOpen(false); setName(mode === 'rename' ? profile?.name ?? '' : ''); setError(''); setDialog(mode);
  };
  async function save() {
    setBusy(true); setError('');
    try {
      if (dialog === 'create') {
        const created = await browserClient.command('browser.createProfile', { name });
        await browserClient.command('browser.openWindow', { profileId: created.id });
      } else if (profile && dialog === 'rename') {
        await browserClient.command('browser.renameProfile', { profileId: profile.id, name });
      } else if (profile && dialog === 'delete') {
        await browserClient.command('browser.deleteProfile', { profileId: profile.id, confirmName: name });
      }
      setDialog(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Menu.Root open={open} onOpenChange={setOpen}>
        <Menu.Trigger render={<IconButton label={profile?.name || '浏览器资料'} />}><UserRound size={18} /></Menu.Trigger>
        <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={8}>
          <Menu.Popup className="browser-menu">
            {snapshot?.profiles.map((item) => (
              <Menu.Item key={item.id} onClick={() => void command('browser.openWindow', { profileId: item.id })}>
                <UserRound size={16} />{item.name}{item.id === profile?.id ? '（当前）' : ''}
              </Menu.Item>
            ))}
            <Menu.Separator className="menu-separator" />
            <Menu.Item onClick={() => showDialog('create')}><Plus size={16} />添加资料</Menu.Item>
            <Menu.Item disabled={!profile} onClick={() => showDialog('rename')}>重命名当前资料</Menu.Item>
            <Menu.Item disabled={!profile || profile.isDefault} onClick={() => showDialog('delete')}>删除当前资料</Menu.Item>
            <Menu.Item onClick={() => void command('browser.openWindow', { isPrivate: true, profileId: profile?.id })}>
              <VenetianMask size={16} />打开私密窗口
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner></Menu.Portal>
      </Menu.Root>
      <Modal open={dialog !== null} onOpenChange={(next) => { if (!next && !busy) setDialog(null); }}
        title={dialog === 'create' ? '添加浏览器资料' : dialog === 'rename' ? '重命名资料' : '删除资料'}>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {dialog === 'delete' && <p>此资料的浏览记录、收藏和设置将被删除。请输入“{profile?.name}”确认。</p>}
          <label className="form-field"><span>{dialog === 'delete' ? '确认资料名称' : '资料名称'}</span>
            <input required maxLength={80} value={name} autoFocus onChange={(event) => setName(event.target.value)} /></label>
          {error && <ErrorNotice message={error} />}
          <div className="form-actions"><button className="button" type="button" onClick={() => setDialog(null)} disabled={busy}>取消</button>
            <button className={`button ${dialog === 'delete' ? 'button-danger' : 'button-primary'}`} type="submit" disabled={busy}>{busy ? '处理中…' : '确认'}</button></div>
        </form>
      </Modal>
    </>
  );
}
