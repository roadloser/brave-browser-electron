import { useState } from 'react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import type { ContentGrant } from '../../../shared/contracts/leo';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';

export function ContentGrantDialog({ tab, open, onOpenChange, onGrant }: {
  tab: TabSnapshot; open: boolean; onOpenChange: (open: boolean) => void; onGrant: (grant: ContentGrant) => void;
}) {
  const [scope, setScope] = useState<'article' | 'selection'>('article');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="允许使用页面内容" open={open} onOpenChange={onOpenChange}>
      <p>将“{tab.title || tab.url}”的选定内容发送给本次使用的模型。</p>
      <p className="leo-detail">授权仅供下一次发送使用，页面改变或五分钟后自动失效。</p>
      <label className="form-field"><span>内容范围</span><select value={scope} onChange={(event) => setScope(event.target.value as 'article' | 'selection')}>
        <option value="article">文章正文</option><option value="selection">页面中选中的文字</option>
      </select></label>
      {error && <ErrorNotice message={error} />}
      <div className="form-actions"><button type="button" className="button" onClick={() => onOpenChange(false)}>取消</button>
        <button type="button" className="button button-primary" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { onGrant(await browserClient.command('leo.grantContent', { tabId: tab.id, scope, confirmed: true })); onOpenChange(false); }
          catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
          finally { setBusy(false); }
        }}>{busy ? '授权中…' : '允许此次使用'}</button></div>
    </Modal>
  );
}
