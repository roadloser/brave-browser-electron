import { useState } from 'react';
import { Shield, ShieldOff } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import type { ShieldsPolicy } from '../../../shared/contracts/shields';
import { browserClient } from '../../../renderer/client/browser-client';
import { IconButton } from '../../../renderer/components/icon-button';
import { Modal } from '../../../renderer/components/modal';
import { useShields } from './use-shields';
import './shields.css';

export function ShieldsPanel({ tab }: { tab?: TabSnapshot }) {
  const [open, setOpen] = useState(false);
  const shields = useShields(tab?.id);
  const enabled = shields.state?.policy.enabled ?? true;
  function update(change: Partial<ShieldsPolicy>) {
    const state = shields.state;
    if (!state?.origin) return;
    void shields.run(() => browserClient.command('shields.setPolicy', { origin: state.origin, policy: { ...state.policy, ...change } }));
  }
  return <>
    <IconButton label="Shields" active={open} disabled={!tab} onClick={() => setOpen(true)}>
      {enabled ? <Shield size={19} /> : <ShieldOff size={19} />}
    </IconButton>
    <Modal open={open} title="Brave Shields" className="shields-panel" onOpenChange={setOpen}>
      {!shields.state?.origin ? <p>Shields 站点设置适用于网页。</p> : <>
        <div className="shields-site"><strong>{new URL(shields.state.origin).hostname}</strong>
          <label><input type="checkbox" checked={enabled} disabled={shields.pending} onChange={event => update({ enabled: event.target.checked })} />Shields {enabled ? '已开启' : '已关闭'}</label></div>
        <div className="shields-count"><strong>{shields.state.blocked}</strong><span>本页已拦截的请求</span></div>
        <p className={shields.state.engine.status === 'ready' ? 'shields-engine' : 'shields-warning'}>
          {shields.state.engine.status === 'ready' ? '广告与跟踪器过滤规则已加载' : shields.state.engine.status === 'loading' ? '正在加载规则，尚未完整启用过滤' : shields.state.engine.status === 'failed' ? '规则加载失败，当前过滤能力未就绪' : '尚未下载过滤规则，请先更新规则'}
        </p>
        <label className="shields-setting">广告与跟踪器<select value={shields.state.policy.blocking} disabled={!enabled || shields.pending}
          onChange={event => update({ blocking: event.target.value as ShieldsPolicy['blocking'] })}>
          <option value="standard">标准</option><option value="aggressive">严格</option></select></label>
        <label className="shields-setting"><span>阻止脚本</span><input type="checkbox" checked={shields.state.policy.blockScripts} disabled={!enabled || shields.pending} onChange={event => update({ blockScripts: event.target.checked })} /></label>
        <label className="shields-setting"><span>升级至 HTTPS</span><input type="checkbox" checked={shields.state.policy.httpsUpgrade} disabled={!enabled || shields.pending} onChange={event => update({ httpsUpgrade: event.target.checked })} /></label>
        <p className="shields-note">站点策略变更后网页会重新加载。{tab?.isPrivate ? '私密窗口的站点更改仅保留到窗口关闭。' : ''}</p>
        <button disabled={shields.pending} onClick={() => void shields.run(() => browserClient.command('shields.resetPolicy', { origin: shields.state!.origin }))}>恢复此站点默认设置</button>
        {Object.entries(shields.state.categories).length > 0 && <ul className="shields-categories">{Object.entries(shields.state.categories).map(([name, count]) => <li key={name}><span>{name}</span><strong>{count}</strong></li>)}</ul>}
      </>}
      <details className="shields-rules"><summary>过滤规则</summary>
        <p>{shields.rules?.version ? `当前版本 ${shields.rules.version.slice(0, 12)}` : '尚未加载规则'}</p>
        {shields.rules?.updatedAt && <p>更新于 {new Date(shields.rules.updatedAt).toLocaleString()}</p>}
        {shields.rules?.error && <p role="alert">{shields.rules.error}</p>}
        <div><button disabled={shields.pending || tab?.isPrivate} onClick={() => void shields.run(() => browserClient.command('shields.updateRules', {}))}>{shields.rules?.status === 'updating' ? '正在更新…' : '更新规则'}</button>
          {shields.rules?.status === 'updating' && <button disabled={tab?.isPrivate} onClick={() => void browserClient.command('shields.cancelUpdate', {}).catch(() => undefined)}>取消更新</button>}
          <button disabled={!shields.rules?.previousVersion || shields.pending || tab?.isPrivate} onClick={() => void shields.run(() => browserClient.command('shields.rollbackRules', {}))}>回滚到上一版本</button></div>
        <p className="shields-note">此版本使用 Ghostery 过滤引擎。规则语义与 Brave 原生引擎存在差异；扩展网络拦截不同时生效。</p>
      </details>
      {shields.error && <p className="shields-error" role="alert">{shields.error}</p>}
    </Modal>
  </>;
}
