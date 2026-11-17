import { useEffect, useState, type FormEvent } from 'react';
import { groupColorSchema, type GroupColor, type TabGroup } from '../../../shared/contracts/tab-groups';
import { browserClient } from '../../../renderer/client/browser-client';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { Modal } from '../../../renderer/components/modal';

const colorNames: Record<GroupColor, string> = {
  grey: '灰色', blue: '蓝色', red: '红色', yellow: '黄色', green: '绿色',
  pink: '粉色', purple: '紫色', cyan: '青色', orange: '橙色',
};

export function GroupMenu({ group, open, onOpenChange }: {
  group: TabGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) { setName(group.name); setColor(group.color); setError(''); }
  }, [open, group.id, group.name, group.color]);

  async function perform(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); onOpenChange(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void perform(() => browserClient.command('tabGroups.update', { groupId: group.id, name, color }));
  }

  return (
    <Modal open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }} title="编辑标签组">
      <form onSubmit={save}>
        <label className="form-field"><span>名称</span><input value={name} maxLength={128} autoFocus onChange={(event) => setName(event.target.value)} placeholder="为标签组命名" /></label>
        <div className="group-color-list" aria-label="标签组颜色">
          {groupColorSchema.options.map((option) => (
            <button type="button" key={option} className="group-color-option" data-group-color={option}
              aria-label={colorNames[option]} aria-pressed={color === option} onClick={() => setColor(option)} />
          ))}
        </div>
        {error && <ErrorNotice message={error} />}
        <div className="form-actions">
          <button type="button" className="button" disabled={busy}
            onClick={() => void perform(() => browserClient.command('tabGroups.ungroup', { groupId: group.id }))}>取消分组</button>
          <button type="button" className="button button-danger" disabled={busy}
            onClick={() => void perform(() => browserClient.command('tabGroups.close', { groupId: group.id }))}>关闭标签组</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? '正在保存…' : '保存'}</button>
        </div>
      </form>
    </Modal>
  );
}
