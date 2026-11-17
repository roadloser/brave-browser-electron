import { useEffect, useState } from 'react';
import type { BrowserSettings, SettingsState } from '../../../shared/contracts/settings';
import { browserClient } from '../../../renderer/client/browser-client';

export function SettingsPage() {
  const [state, setState] = useState<SettingsState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void browserClient.command('settings.get', {}).then(setState).catch(reason => setError(String(reason)));
    return browserClient.on('settings.changed', setState);
  }, []);
  const update = async (patch: Partial<BrowserSettings>) => {
    setBusy(true); setError('');
    try { setState(await browserClient.command('settings.update', patch)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setBusy(false); }
  };
  if (!state) return <section className="feature-page"><h1>设置</h1><p>{error || '正在读取设置…'}</p></section>;
  const values = state.values;
  return <section className="feature-page"><h1>设置</h1>
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={busy}><legend>外观</legend>
      <label>主题 <select value={values.theme} onChange={event => void update({ theme: event.target.value as BrowserSettings['theme'] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
      <label><input type="checkbox" checked={values.verticalTabs} onChange={event => void update({ verticalTabs: event.target.checked })}/>使用纵向标签</label>
      <label><input type="checkbox" checked={values.showBookmarksBar} onChange={event => void update({ showBookmarksBar: event.target.checked })}/>显示书签栏</label>
    </fieldset>
    <fieldset disabled={busy}><legend>启动与搜索</legend>
      <label>启动时 <select value={values.startup} onChange={event => void update({ startup: event.target.value as BrowserSettings['startup'] })}><option value="restore">继续上次浏览</option><option value="new-tab">打开新标签页</option></select></label>
      <label>搜索引擎 <select value={values.searchEngine} onChange={event => void update({ searchEngine: event.target.value as BrowserSettings['searchEngine'] })}><option value="brave">Brave</option><option value="google">Google</option><option value="duckduckgo">DuckDuckGo</option><option value="bing">Bing</option></select></label>
    </fieldset>
    <fieldset disabled={busy}><legend>下载</legend>
      <label><input type="checkbox" checked={values.downloadAskEachTime} onChange={event => void update({ downloadAskEachTime: event.target.checked })}/>每次询问保存位置</label>
      <p>{values.downloadDirectory || '系统下载文件夹'}</p><button onClick={() => void browserClient.command('settings.chooseDownloadDirectory', {}).then(setState).catch(reason => setError(String(reason)))}>更改下载位置</button>
    </fieldset>
    <fieldset disabled={busy}><legend>密码与隐私</legend>
      <label><input type="checkbox" checked={values.savePasswords} onChange={event => void update({ savePasswords: event.target.checked })}/>允许保存密码</label>
      <label><input type="checkbox" checked={values.autofillEnabled} onChange={event => void update({ autofillEnabled: event.target.checked })}/>允许密码填充</label>
      <label><input type="checkbox" checked={values.doNotTrack} onChange={event => void update({ doNotTrack: event.target.checked })}/>发送“请勿跟踪”请求</label>
    </fieldset>
    <button disabled={busy} onClick={() => { if (window.confirm('恢复此资料的默认设置？')) void browserClient.command('settings.reset', {}).then(setState).catch(reason => setError(String(reason))); }}>恢复默认设置</button>
  </section>;
}
