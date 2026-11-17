import { useEffect, useState } from 'react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import type { PrivacyMode, PrivacyState } from '../../../shared/contracts/fingerprint-privacy';
import { browserClient } from '../../../renderer/client/browser-client';
import './privacy.css';

const modes: { value: PrivacyMode; label: string }[] = [
  { value: 'off', label: '关闭' }, { value: 'balanced', label: '平衡' }, { value: 'maximum', label: '严格' },
];
const apiNames = { navigator: 'Navigator', canvas: 'Canvas', audio: '音频', webgl: 'WebGL', fonts: '字体', screen: '屏幕尺寸' };
const contextNames = { window: '主页面', iframe: '子框架', 'dedicated-worker': 'Dedicated Worker', 'shared-worker': 'Shared Worker', 'service-worker': 'Service Worker', worklet: 'Worklet' };

export function PrivacySettings({ tab }: { tab?: TabSnapshot }) {
  const [state, setState] = useState<PrivacyState | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => browserClient.command('privacy.get', { tabId: tab?.id }).then(next => { if (active) setState(next); }).catch(problem => { if (active) setError(problem instanceof Error ? problem.message : '读取隐私策略失败'); });
    const release = browserClient.on('privacy.changed', () => void refresh());
    void refresh();
    return () => { active = false; release(); };
  }, [tab?.id]);

  async function run(operation: () => Promise<PrivacyState>) {
    setPending(true); setError('');
    try { setState(await operation()); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '隐私设置保存失败'); }
    finally { setPending(false); }
  }

  return <section className="privacy-settings">
    <h1>指纹防护</h1>
    <p className="privacy-warning">当前接入部分 Brave 音频与 Canvas 像素算法，子上下文逐项适配中，尚未完成运行对照。下列能力矩阵显示实际实施范围；开启策略不代表全部指纹接口已得到保护。</p>
    {error && <p role="alert">{error}</p>}
    {!state ? <p>正在读取策略…</p> : <>
      <label className="privacy-field">默认策略<select disabled={pending} value={state.defaultMode} onChange={event => void run(() => browserClient.command('privacy.setDefault', { mode: event.target.value as PrivacyMode }))}>
        {modes.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
      </select></label>
      {tab && state.site && <div className="privacy-site"><h2>{state.site}</h2>
        <label className="privacy-field">此站点<select disabled={pending} value={state.inherited ? 'inherit' : state.mode} onChange={event => {
          const mode = event.target.value === 'inherit' ? null : event.target.value as PrivacyMode;
          void run(() => browserClient.command('privacy.setSite', { origin: new URL(tab.url).origin, mode }));
        }}><option value="inherit">使用默认策略</option>{modes.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
        <p>更改后会重新加载相关网页。{tab.isPrivate ? '私密策略和站点 token 不写入普通资料。' : ''}</p></div>}
      <h2>执行上下文与覆盖状态</h2>
      <table><thead><tr><th>接口</th><th>上下文</th><th>实现</th><th>运行对照</th><th>状态说明</th></tr></thead>
        <tbody>{state.capabilities.map(capability => <tr key={`${capability.api}:${capability.context}`}>
          <td>{apiNames[capability.api]}</td><td>{contextNames[capability.context]}</td>
          <td>{capability.implemented ? '局部已接入' : '未接入'}</td><td>{capability.observed ? '有记录' : '未观察'}</td>
          <td>{capability.reason}</td>
        </tr>)}</tbody>
      </table>
      <p className="privacy-meta">运行时映射版本：{state.runtimeVersion}。作用域使用资料、浏览器会话和含 scheme 的站点身份；页面 nonce 尚未完整映射。</p>
    </>}
  </section>;
}
