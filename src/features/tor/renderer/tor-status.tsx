import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import type { TorState } from '../../../shared/contracts/tor';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { IconButton } from '../../../renderer/components/icon-button';

export function TorPanel() {
  const [state, setState] = useState<TorState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void browserClient.command('tor.get', {}).then(setState).catch(reason => setError(String(reason)));
    return browserClient.on('tor.changed', setState);
  }, []);
  const run = async (command: 'tor.chooseComponent' | 'tor.start' | 'tor.cancel' | 'tor.stop' | 'tor.rollbackComponent') => {
    setBusy(true); setError('');
    try { setState(await browserClient.command(command, {})); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Tor 操作失败'); }
    finally { setBusy(false); }
  };
  const connecting = state?.phase === 'starting' || state?.phase === 'bootstrapping';
  return <section className="feature-page"><h1>Tor 私密窗口</h1>
    <p>此模式使用独立的临时浏览数据和 Tor 网络连接。同一 Tor 上下文共享 Cookie，关闭全部 Tor 窗口后清理。</p>
    <p>采用上下文级隔离；不提供逐站点独立线路。</p>
    {error && <p role="alert">{error}</p>}{state?.error && <p role="alert">{state.error}</p>}
    <h2>{state?.summary ?? '正在读取状态…'}</h2>
    {connecting && <><progress max={100} value={state?.bootstrapProgress ?? 0}/><span>{state?.bootstrapProgress ?? 0}%</span><button onClick={() => void run('tor.cancel')}>取消连接</button></>}
    {state?.phase === 'connected' ? <div>
      <button disabled={busy} onClick={() => void run('tor.start')}>打开另一个 Tor 窗口</button>
      <button disabled={busy} onClick={() => {
        if (!window.confirm('更换 Tor 身份会关闭当前全部 Tor 标签并清除其 Cookie，继续？')) return;
        setBusy(true);
        void browserClient.command('tor.newIdentity', { confirmed: true }).then(setState).catch(reason => setError(String(reason))).finally(() => setBusy(false));
      }}>更换身份</button>
      <button disabled={busy} onClick={() => void run('tor.stop')}>断开并关闭 Tor 窗口</button>
    </div> : !connecting && <button disabled={busy || !state?.componentHash} onClick={() => void run('tor.start')}>连接 Tor</button>}
    <details><summary>组件与网络状态</summary>
      <p>固定版本：{state?.version ?? '尚未选择'}</p><p>组件清单摘要：{state?.componentHash ?? '无'}</p>
      <p>网页请求使用固定 SOCKS5 代理；进程或控制连接失败时阻断此上下文网络。非代理 WebRTC UDP 已禁用。</p>
      <p>DNS 预取与实际网络路径尚未观察验收；不会将此状态显示为完整隐私验证通过。</p>
      <button disabled={busy || connecting || state?.phase === 'connected'} onClick={() => void run('tor.chooseComponent')}>选择已验证的官方组件</button>
      <button disabled={busy || !state?.canRollback || connecting || state?.phase === 'connected'} onClick={() => void run('tor.rollbackComponent')}>回滚到上一个组件</button>
      <p>目录需要包含 tor-component.json。组件清单、版本、架构与每个文件 SHA-256 必须匹配，来源和验证依据指向 Tor Project 官方地址。</p>
    </details>
  </section>;
}
export function TorButton() {
  const [open, setOpen] = useState(false);
  return <><IconButton label="Tor 私密窗口" onClick={() => setOpen(true)}><Shield size={16}/></IconButton>
    <Modal open={open} onOpenChange={setOpen} title="Tor 私密窗口"><TorPanel/></Modal></>;
}
