import { useEffect, useState } from 'react';
import type { DownloadsState } from '../../../shared/contracts/downloads';
import { browserClient } from '../../../renderer/client/browser-client';
import { DownloadRow } from './download-row';

export function DownloadsPage() {
  const [state, setState] = useState<DownloadsState>({ items: [], revision: 0 });
  const [error, setError] = useState('');
  useEffect(() => {
    void browserClient.command('downloads.list', {}).then(setState).catch(reason => setError(String(reason)));
    return browserClient.on('downloads.changed', setState);
  }, []);
  return <section className="feature-page"><h1>下载</h1>
    <button onClick={() => void browserClient.command('downloads.clearFinished', {}).then(setState).catch(reason => setError(String(reason)))}>清除已结束记录</button>
    {error && <p role="alert">{error}</p>}
    {!state.items.length && <p>下载的文件会显示在这里。</p>}
    {state.items.map(item => <DownloadRow key={item.id} item={item} onError={setError}/>)}
  </section>;
}
