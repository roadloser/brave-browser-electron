import type { DownloadRecord } from '../../../shared/contracts/downloads';
import { browserClient } from '../../../renderer/client/browser-client';

const labels = { progressing: '下载中', paused: '已暂停', interrupted: '已中断', completed: '已完成', cancelled: '已取消' };
export function DownloadRow({ item, onError }: { item: DownloadRecord; onError: (message: string) => void }) {
  const run = (action: 'pause' | 'resume' | 'cancel' | 'retry' | 'remove' | 'open' | 'showInFolder') => {
    void browserClient.command(`downloads.${action}`, { id: item.id }).catch(error => onError(error instanceof Error ? error.message : '下载操作失败'));
  };
  return <article className="download-row"><div><strong>{item.filename}</strong><p>{item.url}</p>
    <p>{labels[item.state]} · {(item.receivedBytes / 1048576).toFixed(1)} MB{item.totalBytes > 0 ? ' / ' + (item.totalBytes / 1048576).toFixed(1) + ' MB' : ''}</p>
    {['progressing', 'paused'].includes(item.state) && <progress value={item.totalBytes ? item.receivedBytes : undefined} max={item.totalBytes || undefined}/>}
    {item.error && <p>{item.error}</p>}
    {item.state === 'completed' && !item.fileExists && <p>文件已移动或删除</p>}
  </div><div>
    {item.state === 'progressing' && <button onClick={() => run('pause')}>暂停</button>}
    {item.state === 'paused' && item.canResume && <button onClick={() => run('resume')}>继续</button>}
    {['paused', 'progressing'].includes(item.state) && <button onClick={() => run('cancel')}>取消</button>}
    {['cancelled', 'interrupted'].includes(item.state) && <button onClick={() => run('retry')}>重试</button>}
    {item.state === 'completed' && item.fileExists && <><button onClick={() => run('open')}>打开</button><button onClick={() => run('showInFolder')}>在文件夹中显示</button></>}
    {!['paused', 'progressing'].includes(item.state) && <button onClick={() => run('remove')}>移除记录</button>}
  </div></article>;
}
