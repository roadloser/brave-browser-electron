import type { HistoryEntry } from '../../../shared/contracts/history';

type Props = {
  entry: HistoryEntry; selected: boolean; disabled: boolean;
  onSelect: (checked: boolean) => void; onOpen: () => void; onDelete: () => void;
};

export function HistoryRow({ entry, selected, disabled, onSelect, onOpen, onDelete }: Props) {
  let host = entry.url;
  try { host = new URL(entry.url).hostname; } catch {}
  return <li className="history-row">
    <input type="checkbox" checked={selected} disabled={disabled} aria-label={`选择 ${entry.title}`}
      onChange={event => onSelect(event.target.checked)} />
    <time dateTime={new Date(entry.visitedAt).toISOString()}>{new Date(entry.visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
    <button className="history-open" onClick={onOpen}><strong>{entry.title || entry.url}</strong><small>{host}</small></button>
    <button disabled={disabled} aria-label={`删除 ${entry.title}`} onClick={onDelete}>删除</button>
  </li>;
}
