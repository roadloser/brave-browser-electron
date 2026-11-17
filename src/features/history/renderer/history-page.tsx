import { useState } from 'react';
import type { HistoryEntry } from '../../../shared/contracts/history';
import { browserClient } from '../../../renderer/client/browser-client';
import { useHistory } from './use-history';
import { HistoryRow } from './history-row';
import { HistoryClearDialog } from './history-clear-dialog';
import { Modal } from '../../../renderer/components/modal';
import './history.css';

function timestamp(value: string, nextDay = false): number | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function HistoryPage() {
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const history = useHistory({ query, from: timestamp(from), to: timestamp(to, true) });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [openError, setOpenError] = useState('');
  const selectedIds = history.entries.filter(entry => selected.has(entry.id)).map(entry => entry.id);
  const days = new Map<string, HistoryEntry[]>();
  for (const entry of history.entries) {
    const day = new Date(entry.visitedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    days.set(day, [...(days.get(day) ?? []), entry]);
  }

  async function open(entry: HistoryEntry) {
    try {
      setOpenError('');
      await browserClient.command('browser.openTab', { url: entry.url, active: true });
    } catch (problem) { setOpenError(problem instanceof Error ? problem.message : '页面无法打开'); }
  }

  return <section className="history-page">
    <header><h1>历史记录</h1>
      <input aria-label="搜索历史记录" placeholder="搜索历史记录" value={query} onChange={event => { setQuery(event.target.value); setSelected(new Set()); }} />
      <button onClick={() => setClearOpen(true)}>清除浏览历史记录</button>
    </header>
    <div className="history-filters">
      <label>开始日期<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>结束日期<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      {(from || to || query) && <button onClick={() => { setFrom(''); setTo(''); setQuery(''); setSelected(new Set()); }}>重置筛选</button>}
      <span>{history.total} 条记录</span>
      {selectedIds.length > 0 && <button disabled={history.pending} onClick={() => setDeleteIds(selectedIds)}>删除所选 {selectedIds.length} 条</button>}
    </div>
    {(history.error || openError) && <div className="history-error" role="alert">{history.error || openError}
      <button onClick={() => void history.refresh()}>重新加载</button></div>}
    <main aria-busy={history.loading}>
      {!history.entries.length && <p className="history-empty">{history.loading ? '正在读取历史记录…' : '没有符合条件的浏览历史记录'}</p>}
      {[...days].map(([day, entries]) => <section className="history-day" key={day}><h2>{day}</h2><ul>
        {entries.map(entry => <HistoryRow key={entry.id} entry={entry} selected={selected.has(entry.id)} disabled={history.pending}
          onSelect={checked => setSelected(previous => {
            const next = new Set(previous); if (checked) next.add(entry.id); else next.delete(entry.id); return next;
          })} onOpen={() => void open(entry)} onDelete={() => setDeleteIds([entry.id])} />)}
      </ul></section>)}
      {history.nextOffset !== null && <button className="history-more" disabled={history.loading} onClick={() => void history.loadMore()}>{history.loading ? '正在加载…' : '加载更早记录'}</button>}
    </main>
    {clearOpen && <HistoryClearDialog pending={history.pending} error={history.error} onClose={() => setClearOpen(false)}
      onClear={async start => { if (await history.clear({ from: start })) { setClearOpen(false); setSelected(new Set()); } }} />}
    {deleteIds && <Modal open title={`删除 ${deleteIds.length} 条记录？`} className="history-dialog"
      onOpenChange={open => { if (!open && !history.pending) setDeleteIds(null); }}>
      <p>这些浏览记录将从当前资料中删除。</p>
      {history.error && <p role="alert">{history.error}</p>}
      <footer><button disabled={history.pending} onClick={() => setDeleteIds(null)}>取消</button>
        <button disabled={history.pending} onClick={async () => {
          if (await history.remove(deleteIds)) { setDeleteIds(null); setSelected(new Set()); }
        }}>{history.pending ? '正在删除…' : '删除'}</button></footer>
    </Modal>}
  </section>;
}
