import { useEffect, useState } from 'react';
import type { SiteSettingsState } from '../../../shared/contracts/site-settings';
import { browserClient } from '../../../renderer/client/browser-client';
const labels = { camera: '摄像头', microphone: '麦克风', geolocation: '位置', notifications: '通知', 'clipboard-read': '剪贴板', midi: 'MIDI', fullscreen: '全屏', pointerLock: '鼠标锁定' };

export function SitePermissionPanel({ origin }: { origin?: string }) {
  const [state, setState] = useState<SiteSettingsState>({ rules: [], prompts: [], revision: 0 });
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    void browserClient.command('siteSettings.get', { origin }).then(setState).catch(reason => setError(String(reason)));
    return browserClient.on('siteSettings.changed', setState);
  }, [origin]);
  const run = (operation: Promise<unknown>) => { void operation.catch(reason => setError(reason instanceof Error ? reason.message : '权限操作失败')); };
  return <section className="feature-page"><h1>网站权限</h1>{origin && <p>{origin}</p>}{error && <p role="alert">{error}</p>}
    {state.prompts.map(prompt => <article key={prompt.id}><strong>{prompt.origin} 请求使用{labels[prompt.permission]}</strong>
      {prompt.origin !== prompt.topLevelOrigin && <p>嵌入于 {prompt.topLevelOrigin}</p>}
      <label><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/>记住此决定</label>
      <button onClick={() => run(browserClient.command('siteSettings.resolve', { id: prompt.id, allow: true, remember }))}>允许</button>
      <button onClick={() => run(browserClient.command('siteSettings.resolve', { id: prompt.id, allow: false, remember }))}>拒绝</button>
    </article>)}
    {state.rules.filter(rule => !origin || rule.origin === origin).map(rule => <article key={rule.origin + rule.permission}><span>{rule.origin} · {labels[rule.permission]}</span>
      <select value={rule.decision} onChange={event => run(browserClient.command('siteSettings.set', { origin: rule.origin, permission: rule.permission, decision: event.target.value as 'allow' | 'deny' | 'ask' }))}><option value="allow">允许</option><option value="deny">禁止</option><option value="ask">每次询问</option></select>
    </article>)}
    {!state.rules.length && !state.prompts.length && <p>网站请求权限时会在这里显示。</p>}
    {origin && <button onClick={() => { if (window.confirm('清除此站点的 Cookie 和本地数据？')) run(browserClient.command('siteSettings.clearData', { origin, cookies: true, cache: false, localStorage: true })); }}>清除此站点数据</button>}
  </section>;
}
