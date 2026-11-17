import { useEffect, useState } from 'react';
import type { CredentialsState } from '../../../shared/contracts/credentials';
import { browserClient } from '../../../renderer/client/browser-client';
import { CredentialPrompt } from './credential-prompt';

export function CredentialsPage({ tabId }: { tabId?: string }) {
  const [state, setState] = useState<CredentialsState>();
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    void browserClient.command('credentials.list', {}).then(setState).catch(reason => setError(String(reason)));
    return browserClient.on('credentials.changed', setState);
  }, []);
  return <section className="feature-page"><h1>密码管理器</h1>
    {error && <p role="alert">{error}</p>}{state?.reason && <p>{state.reason}</p>}
    {tabId && <button disabled={!state?.available} onClick={() => void browserClient.command('credentials.capture', { tabId }).then(setState).catch(reason => setError(String(reason)))}>保存当前登录表单</button>}
    {state?.candidates.map(candidate => <CredentialPrompt key={candidate.id} candidate={candidate} onError={setError}/>)}
    <form onSubmit={event => { event.preventDefault(); void browserClient.command('credentials.save', { origin: new URL(origin).origin, username, password }).then(next => { setState(next); setPassword(''); }).catch(reason => setError(String(reason))); }}>
      <label>网站来源<input type="url" value={origin} required placeholder="https://example.com" onChange={event => setOrigin(event.target.value)}/></label>
      <label>用户名<input autoComplete="off" value={username} onChange={event => setUsername(event.target.value)}/></label>
      <label>密码<input type="password" autoComplete="new-password" value={password} required onChange={event => setPassword(event.target.value)}/></label>
      <button disabled={!state?.available}>添加密码</button>
    </form>
    {state?.entries.map(entry => <article key={entry.id}><strong>{entry.origin}</strong><span>{entry.username}</span>
      {tabId && <button onClick={() => void browserClient.command('credentials.fill', { tabId, credentialId: entry.id }).catch(reason => setError(String(reason)))}>填入当前页</button>}
      <button onClick={() => { if (window.confirm('删除此网站的密码？')) void browserClient.command('credentials.remove', { id: entry.id }).then(setState).catch(reason => setError(String(reason))); }}>删除</button>
    </article>)}
    {state && !state.entries.length && <p>尚未保存密码。</p>}
  </section>;
}
