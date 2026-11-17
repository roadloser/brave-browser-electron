import { useState } from 'react';
import type { SiteDataClearResult, SiteDataDetails } from '../../../shared/contracts/site-data';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';

const stepNames = { cookies: 'Cookie', storage: '网站存储', permissions: '权限' };
export function SiteDataClearDialog({ details, onClose, onCleared }: { details: SiteDataDetails; onClose: () => void; onCleared: () => void }) {
  const [cookies, setCookies] = useState(true);
  const [storage, setStorage] = useState(true);
  const [permissions, setPermissions] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SiteDataClearResult>();
  const [error, setError] = useState('');
  const scopes = [...new Set(details.cookies.map(cookie => cookie.domain + ' · ' + (cookie.partitionKey ?? '非分区')))];
  const clear = async () => {
    setPending(true); setError('');
    try {
      const next = await browserClient.command('siteData.clear', { origin: details.origin, cookies, storage, permissions, confirmed: true });
      setResult(next); onCleared();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '清理失败'); }
    finally { setPending(false); }
  };
  return <Modal open title="清除此网站的数据？" onOpenChange={open => { if (!open && !pending) onClose(); }} className="site-data-dialog">
    <p><strong>{details.origin}</strong></p>
    <p>网站可能会退出登录。仍在打开的页面可能再次保存数据。</p>
    <fieldset disabled={pending || result?.cleared}><legend>清理范围</legend>
      <label><input type="checkbox" checked={cookies} onChange={event => setCookies(event.target.checked)}/>Cookie（域/路径/分区匹配）</label>
      {cookies && <><p>Cookie 不按端口隔离，父域 Cookie 与其他子域共享。此次涉及：</p>
        <ul>{scopes.length ? scopes.map(scope => <li key={scope}>{scope}</li>) : <li>当前未发现匹配 Cookie</li>}</ul></>}
      <label><input type="checkbox" checked={storage} onChange={event => setStorage(event.target.checked)}/>此精确来源在所有上下文中的网站存储与缓存</label>
      {storage && <p>只匹配此协议、主机和端口，不清除此页面中其他来源的嵌入内容。</p>}
      <label><input type="checkbox" checked={permissions} onChange={event => setPermissions(event.target.checked)}/>重置此来源权限为询问</label>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status"><strong>{result.cleared ? '所选操作已完成' : '部分操作未完成'}</strong>
      <ul>{result.steps.map(step => <li key={step.kind}>{stepNames[step.kind]}：{step.status === 'cleared' ? '已清理' : step.status === 'skipped' ? '未选择' : step.error || '失败'}</li>)}</ul>
    </div>}
    <footer><button disabled={pending} onClick={onClose}>{result ? '关闭' : '取消'}</button>
      {!result?.cleared && <button disabled={pending || (!cookies && !storage && !permissions)} onClick={() => void clear()}>{pending ? '正在清理…' : result ? '重试所选操作' : '清理'}</button>}</footer>
  </Modal>;
}
