import { useEffect, useState } from 'react';
import type { SyncCode, SyncDataType, SyncState } from '../../../shared/contracts/sync';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';

const names: Record<SyncDataType, string> = { bookmarks: '书签', history: '历史记录', settings: '设置', passwords: '密码', tabs: '打开的标签' };
const statuses = { disconnected: '未加入同步链', ready: '已就绪', syncing: '正在同步', paused: '已暂停', error: '同步失败', 'needs-authorization': '需要服务授权' };
const official = { unconfigured: '尚未配置', unverified: '尚未确认', accepted: '服务已接受最近一次同步', rejected: '服务拒绝认证' };

export function SyncSettings() {
  const [state, setState] = useState<SyncState>();
  const [error, setError] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [shownCode, setShownCode] = useState<SyncCode>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void browserClient.command('sync.get', {}).then(value => { setState(value); setEndpoint(value.endpoint); setDeviceName(value.deviceName); }).catch(reason => setError(String(reason)));
    return browserClient.on('sync.changed', setState);
  }, []);
  useEffect(() => {
    if (!shownCode) return;
    const timeout = setTimeout(() => setShownCode(undefined), 60000);
    const hide = () => { if (document.hidden) setShownCode(undefined); };
    document.addEventListener('visibilitychange', hide);
    return () => { clearTimeout(timeout); document.removeEventListener('visibilitychange', hide); };
  }, [shownCode]);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await operation(); } catch (reason) { setError(reason instanceof Error ? reason.message : '同步操作失败'); }
    finally { setBusy(false); }
  };
  const toggle = (type: SyncDataType) => {
    if (!state) return;
    const enabledTypes = state.enabledTypes.includes(type) ? state.enabledTypes.filter(candidate => candidate !== type) : [...state.enabledTypes, type];
    void run(() => browserClient.command('sync.setTypes', { enabledTypes }).then(setState));
  };
  return <section className="feature-page"><h1>同步</h1>
    {error && <p role="alert">{error}</p>}
    {state && <><p><strong>{statuses[state.status]}</strong> · {official[state.officialStatus]}</p>
      {state.error && <p role="alert">{state.error}</p>}
      <p>待发送 {state.pending} 项{state.lastSync ? ' · 上次同步 ' + new Date(state.lastSync).toLocaleString() : ''}</p>
      <form onSubmit={event => { event.preventDefault(); void run(() => browserClient.command('sync.configure', { endpoint, deviceName, serviceKey: serviceKey || undefined }).then(value => { setState(value); setServiceKey(''); })); }}>
        <label>设备名称<input value={deviceName} required onChange={event => setDeviceName(event.target.value)}/></label>
        <details><summary>服务连接</summary>
          <label>同步服务地址<input type="url" value={endpoint} required onChange={event => setEndpoint(event.target.value)}/></label>
          <label>服务授权密钥<input type="password" value={serviceKey} autoComplete="off" placeholder={state.hasServiceKey ? '已安全保存，留空保留' : '由服务提供方授权'} onChange={event => setServiceKey(event.target.value)}/></label>
          <p>官方服务资格与客户端协议状态分别显示。不会创建替代同步服务器。</p>
        </details>
        <button disabled={busy || state.status === 'syncing'}>保存连接设置</button>
      </form>
      {!state.deviceId ? <div>
        <button disabled={busy} onClick={() => { if (window.confirm('创建新的端到端加密同步链？')) void run(() => browserClient.command('sync.createChain', { confirmed: true }).then(setShownCode)); }}>创建同步链</button>
        <form onSubmit={event => { event.preventDefault(); void run(() => browserClient.command('sync.joinChain', { code: joinCode }).then(value => { setState(value); setJoinCode(''); })); }}>
          <label>从另一台设备复制的 25 个单词<textarea value={joinCode} required autoComplete="off" spellCheck={false} onChange={event => setJoinCode(event.target.value)}/></label>
          <button disabled={busy}>加入已有同步链</button>
        </form>
      </div> : <div>
        <fieldset disabled={busy || state.status === 'syncing'}><legend>同步内容</legend>{state.capabilities.map(capability => <label key={capability.dataType}>
          <input type="checkbox" checked={state.enabledTypes.includes(capability.dataType)} disabled={capability.status !== 'implemented'} onChange={() => toggle(capability.dataType)}/>{names[capability.dataType]}
          {capability.reason && <small>{capability.reason}</small>}
        </label>)}</fieldset>
        {state.status === 'syncing' ? <button onClick={() => void browserClient.command('sync.cancel', {}).then(setState).catch(reason => setError(String(reason)))}>取消同步</button> : <button disabled={busy} onClick={() => void run(() => browserClient.command('sync.run', {}).then(setState))}>立即同步</button>}
        <button disabled={busy} onClick={() => { if (window.confirm('显示同步代码会允许持有者加入此同步链，继续？')) void run(() => browserClient.command('sync.showCode', { confirmed: true }).then(setShownCode)); }}>查看同步代码</button>
        <button disabled={busy} onClick={() => { if (window.confirm('从此设备退出同步链？本地书签和浏览数据会保留。')) void run(() => browserClient.command('sync.leave', { confirmed: true }).then(setState)); }}>离开同步链</button>
      </div>}
      {!!state.conflicts.length && <section><h2>需要处理的冲突</h2>{state.conflicts.map(conflict => <article key={conflict.id}><p>{names[conflict.dataType]}</p><p>本地：{conflict.localSummary}</p><p>远端：{conflict.remoteSummary}</p>
        <button disabled={busy} onClick={() => void run(() => browserClient.command('sync.resolveConflict', { id: conflict.id, keep: 'local' }).then(setState))}>保留本地</button>
        <button disabled={busy} onClick={() => void run(() => browserClient.command('sync.resolveConflict', { id: conflict.id, keep: 'remote' }).then(setState))}>使用远端</button>
      </article>)}</section>}
      {!!state.remoteDevices.length && <section><h2>其他设备</h2>{state.remoteDevices.map(device => <article key={device.id}>
        <h3>{device.name}</h3><p>最后活动：{new Date(device.lastSeen).toLocaleString()}</p>
        {state.remoteTabs.filter(tab => tab.deviceId === device.id).map(tab => <button key={tab.tabId} onClick={() => void run(() => browserClient.command('sync.openRemoteTab', { deviceId: device.id, tabId: tab.tabId }))}>{tab.title}<small>{tab.url}</small></button>)}
      </article>)}</section>}
    </>}
    <Modal open={!!shownCode} title="同步代码" onOpenChange={open => { if (!open) setShownCode(undefined); }}>
      <p>仅在自己的设备之间传递。此处将在一分钟后隐藏。</p><p className="sync-code">{shownCode?.code}</p>
      <p>代码有效期至 {shownCode ? new Date(shownCode.expiresAt).toLocaleString() : ''}</p>
      <button onClick={() => setShownCode(undefined)}>已记录，隐藏代码</button>
    </Modal>
  </section>;
}
