import { useEffect, useState } from 'react';
import type { VpnState } from '../../../shared/contracts/vpn';
import { browserClient } from '../../../renderer/client/browser-client';
import { VpnAccountForm } from './vpn-account-form';

export function VpnPanel() {
  const [state, setState] = useState<VpnState>();
  const [regionId, setRegionId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const accept = (next: VpnState) => { if (active) { setState(previous => !previous || next.revision >= previous.revision ? next : previous); setRegionId(previous => previous || next.region?.id || ''); } };
    void browserClient.command('vpn.get', {}).then(accept).then(() => browserClient.command('vpn.refresh', {})).then(accept).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '无法读取VPN状态'); });
    const unsubscribe = browserClient.on('vpn.changed', accept);
    return () => { active = false; unsubscribe(); };
  }, []);
  const perform = async (operation: () => Promise<VpnState | void>) => {
    setBusy(true); setError('');
    try { const next = await operation(); if (next) setState(previous => !previous || next.revision >= previous.revision ? next : previous); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'VPN操作失败'); }
    finally { setBusy(false); }
  };
  const working = busy || ['authorizing', 'preparing', 'connecting', 'disconnecting'].includes(state?.phase ?? '');
  const connected = state?.systemStatus === 'connected';
  const supported = state?.capabilities.supported !== false;
  return <section className="feature-page vpn-page"><h1>Brave VPN</h1>
    <p>通过 Guardian 和 macOS 系统 IKEv2 连接，影响此设备的网络。首次使用或更换地区需在系统设置确认安装。</p>
    {!supported && <p role="alert">当前系统不支持此连接方式。</p>}
    {error && <p role="alert">{error}</p>}{state?.error && state.error !== error && <p role="alert">{state.error}</p>}
    <h2 aria-live="polite">{state?.summary ?? '正在读取状态…'}</h2>
    <p>{state?.region?.name ?? '尚未选择地区'}{state?.hostname ? ` · ${state.hostname}` : ''}</p>
    <div className="vpn-actions">
      {connected ? <button disabled={working || !supported} onClick={() => void perform(() => browserClient.command('vpn.disconnect', {}))}>断开 VPN</button> : <button disabled={working || !supported || !state?.serviceId} onClick={() => void perform(() => browserClient.command('vpn.connect', {}))}>连接 VPN</button>}
      <button disabled={working || !supported} onClick={() => void perform(() => browserClient.command('vpn.refresh', {}))}>刷新系统状态</button>
      {working && <button onClick={() => void browserClient.command('vpn.cancel', {}).then(setState).catch(reason => setError(String(reason)))}>取消当前操作</button>}
    </div>
    <fieldset disabled={working || connected || !supported}><legend>服务器地区</legend>
      <button onClick={() => void perform(() => browserClient.command('vpn.loadRegions', {}))}>读取可用地区</button>
      <label>地区 <select value={regionId} onChange={event => setRegionId(event.target.value)}><option value="">请选择</option>{state?.regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
      <button disabled={!regionId || !state?.hasCredential || state?.secretStorageAvailable === false} onClick={() => void perform(() => browserClient.command('vpn.prepare', { regionId }))}>准备此地区配置</button>
    </fieldset>
    {state?.configurationId && <fieldset disabled={working || connected || !supported}><legend>系统安装</legend>
      <p>安装文件包含连接凭据，仅在本机临时保存。请在系统设置完成安装后刷新状态；文件十分钟后清理。</p>
      <button onClick={() => {
        if (window.confirm('为此设备打开VPN配置安装？配置包含连接凭据，请勿分享。系统仍会要求您确认安装。')) void perform(() => browserClient.command('vpn.install', { confirmed: true }));
      }}>{state.installationPending ? '重新打开安装配置' : '打开系统安装配置'}</button>
      <button disabled={!state.canRollback} onClick={() => {
        if (window.confirm('恢复上一版配置？恢复后需要重新完成系统安装。')) void perform(() => browserClient.command('vpn.rollback', { confirmed: true }));
      }}>恢复上一版配置</button>
      <p>卸载配置需在 macOS 系统设置中操作；本应用不会修改其他 VPN。</p>
    </fieldset>}
    <VpnAccountForm state={state} disabled={working || connected || !supported} perform={perform}/>
    <details><summary>连接范围</summary><p>此方式提供系统 IKEv2 连接。路由、DNS 和意外断线时的网络阻断尚未观察验收；不保证断线阻断。</p><p>当前不提供 WireGuard、多跳或智能分流。退出本应用会尝试断开由本应用识别的VPN连接。</p><p>系统服务：{state?.serviceId ?? '尚未识别'}；系统状态：{state?.systemStatus ?? 'unknown'}</p></details>
  </section>;
}
