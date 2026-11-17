import { useState } from 'react';
import { Modal } from '../../../renderer/components/modal';

type Props = { pending: boolean; error: string; onClose: () => void; onClear: (from?: number) => Promise<void> };
const periods = [
  { label: '过去一小时', hours: 1 }, { label: '过去 24 小时', hours: 24 },
  { label: '过去 7 天', hours: 168 }, { label: '过去 4 周', hours: 672 }, { label: '全部时间', hours: 0 },
];

export function HistoryClearDialog({ pending, error, onClose, onClear }: Props) {
  const [hours, setHours] = useState(1);
  return <Modal open title="清除浏览历史记录" className="history-dialog"
    onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <p>删除所选时间内当前资料的浏览记录。这不会删除书签、下载文件、Cookie 或已保存的密码。</p>
    <label>时间范围<select autoFocus value={hours} onChange={event => setHours(Number(event.target.value))}>
      {periods.map(period => <option key={period.hours} value={period.hours}>{period.label}</option>)}
    </select></label>
    {error && <p role="alert">{error}</p>}
    <footer><button disabled={pending} onClick={onClose}>取消</button>
      <button disabled={pending} onClick={() => void onClear(hours ? Date.now() - hours * 3_600_000 : undefined)}>{pending ? '正在清除…' : '清除历史记录'}</button></footer>
  </Modal>;
}
