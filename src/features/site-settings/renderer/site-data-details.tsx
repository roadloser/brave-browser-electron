import { useEffect, useState } from 'react';
import type { SiteDataDetails as Details } from '../../../shared/contracts/site-data';
import { browserClient } from '../../../renderer/client/browser-client';
import { SiteDataClearDialog } from './site-data-clear-dialog';

export function formatStorage(bytes: number | null): string {
  if (bytes === null) return '未读取';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
export function SiteDataDetails({ origin, onBack, onChanged }: { origin: string; onBack: () => void; onChanged: () => void }) {
  const [details, setDetails] = useState<Details>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const refresh = async () => {
    setLoading(true); setError('');
    try { setDetails(await browserClient.command('siteData.details', { origin })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法读取站点数据'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [origin]);
  return <div><button onClick={onBack}>返回站点列表</button><h2>{origin}</h2>
    {error && <p role="alert">{error}</p>}
    <button disabled={loading} onClick={() => void refresh()}>{loading ? '正在读取…' : '刷新'}</button>
    {details && <>
      <p>第一方 quota 存储：{formatStorage(details.totalUsage)}（不含完整 localStorage 或分区数据）</p>
      <button onClick={() => setClearOpen(true)}>清理数据与权限…</button>
      <h3>Cookie 元数据（{details.cookies.length}）</h3>
      {!details.cookies.length ? <p>没有匹配 Cookie。</p> : <div className="site-cookie-table"><table><thead><tr><th>名称</th><th>域 / 路径</th><th>分区</th><th>属性</th><th>有效期</th></tr></thead><tbody>
        {details.cookies.map((cookie, index) => <tr key={cookie.name + cookie.domain + cookie.path + index}><td>{cookie.name || '（空名称）'}</td><td>{cookie.domain}<small>{cookie.path}</small></td><td>{cookie.partitionKey ?? '非分区'}</td><td>{[cookie.hostOnly ? '仅主机' : '域共享', cookie.secure && 'Secure', cookie.httpOnly && 'HttpOnly', cookie.sameSite].filter(Boolean).join(' · ')}</td><td>{cookie.session ? '会话期间' : cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleString() : '未知'}</td></tr>)}
      </tbody></table></div>}
      <h3>存储类型</h3><ul>{details.storageUsage.map(entry => <li key={entry.storageType}>{entry.storageType}：{formatStorage(entry.usage)}</li>)}</ul>
      <details><summary>统计与清理边界</summary><ul>{details.limitations.map(value => <li key={value}>{value}</li>)}</ul></details>
      {clearOpen && <SiteDataClearDialog details={details} onClose={() => setClearOpen(false)} onCleared={() => { onChanged(); void refresh(); }}/>}
    </>}
  </div>;
}
