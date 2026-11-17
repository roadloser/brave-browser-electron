import { useEffect, useState } from 'react';
import type { SiteDataState } from '../../../shared/contracts/site-data';
import { browserClient } from '../../../renderer/client/browser-client';
import { SiteDataDetails, formatStorage } from './site-data-details';
import './site-data.css';

export function SiteDataPage() {
  const [state, setState] = useState<SiteDataState>();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true); setError('');
    try { setState(await browserClient.command('siteData.list', {})); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法读取站点列表'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void refresh();
    const stopData = browserClient.on('siteData.changed', next => setState(previous => !previous || next.revision >= previous.revision ? next : previous));
    const stopPermissions = browserClient.on('siteSettings.changed', () => { void refresh(); });
    return () => { stopData(); stopPermissions(); };
  }, []);
  const term = query.trim().toLocaleLowerCase();
  const sites = state?.sites.filter(site => site.origin.toLocaleLowerCase().includes(term)) ?? [];
  return <section className="feature-page site-data-page"><h1>网站数据与权限</h1>
    {selected ? <SiteDataDetails key={selected} origin={selected} onBack={() => setSelected(undefined)} onChanged={() => void refresh()}/> : <>
      <p>管理当前浏览器上下文内的 Cookie、网站存储和权限。</p>
      <div className="site-data-toolbar"><input aria-label="搜索网站数据" placeholder="搜索网站" value={query} onChange={event => setQuery(event.target.value)}/>
        <button disabled={loading} onClick={() => void refresh()}>{loading ? '正在读取…' : '刷新'}</button></div>
      {error && <p role="alert">{error}</p>}
      {!sites.length && <p>{loading ? '正在载入站点…' : '没有匹配的已观察站点。'}</p>}
      <ul className="site-data-list">{sites.map(site => <li key={site.origin}><button onClick={() => setSelected(site.origin)}>
        <strong>{site.origin}</strong><span>{site.cookieCount} 个 Cookie · {site.permissionsCount} 条权限 · 一方存储 {formatStorage(site.storageBytes)}</span>
        <small>{site.lastSeen ? '最近观察 ' + new Date(site.lastSeen).toLocaleString() : '来源于 Cookie 元数据'}</small>
      </button></li>)}</ul>
      {!!state?.cookieScopes.length && <details><summary>Cookie 存储域（不等于网站来源）</summary><ul>{state.cookieScopes.filter(scope => scope.domain.toLocaleLowerCase().includes(term)).map(scope => <li key={scope.domain + scope.partitioned}>{scope.domain} · {scope.hostOnly ? '仅主机' : '域共享'} · {scope.partitioned ? '分区' : '非分区'} · {scope.count} 个</li>)}</ul></details>}
      {state && <details><summary>列表覆盖范围</summary><ul>{state.limitations.map(value => <li key={value}>{value}</li>)}</ul></details>}
    </>}
  </section>;
}
