import { useEffect, useState } from 'react';
import type { PermissionPrompt } from '../../../shared/contracts/site-settings';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';

const labels = { camera: '摄像头', microphone: '麦克风', geolocation: '位置信息', notifications: '通知', 'clipboard-read': '剪贴板', midi: 'MIDI 设备', fullscreen: '全屏', pointerLock: '鼠标锁定' };
export function PermissionNotifications() {
  const [prompts, setPrompts] = useState<PermissionPrompt[]>([]);
  const [tabIds, setTabIds] = useState<string[]>([]);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => void browserClient.command('siteSettings.get', {}).then(state => setPrompts(state.prompts)).catch(reason => setError(String(reason)));
    void browserClient.command('browser.getState', {}).then(state => setTabIds(state.windows.find(window => window.id === state.currentWindowId)?.tabs.map(tab => tab.id) ?? []));
    refresh();
    const stopPermissions = browserClient.on('siteSettings.changed', state => setPrompts(state.prompts));
    const stopBrowser = browserClient.on('browser.state', state => setTabIds(state.windows.find(window => window.id === state.currentWindowId)?.tabs.map(tab => tab.id) ?? []));
    return () => { stopPermissions(); stopBrowser(); };
  }, []);
  const prompt = prompts.find(candidate => tabIds.includes(candidate.tabId));
  const resolve = (allow: boolean) => {
    if (!prompt) return;
    void browserClient.command('siteSettings.resolve', { id: prompt.id, allow, remember }).then(state => { setPrompts(state.prompts); setRemember(false); setError(''); })
      .catch(reason => setError(reason instanceof Error ? reason.message : '权限操作失败'));
  };
  return <Modal open={!!prompt} onOpenChange={open => { if (!open) resolve(false); }} title="网站权限请求">
    {prompt && <><p><strong>{prompt.origin}</strong> 请求使用{labels[prompt.permission]}。</p>
      {prompt.origin !== prompt.topLevelOrigin && <p>此网站嵌入于 {prompt.topLevelOrigin}</p>}
      <label><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/>记住此网站的选择</label>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions"><button onClick={() => resolve(false)}>拒绝</button><button onClick={() => resolve(true)}>允许</button></div>
    </>}
  </Modal>;
}
