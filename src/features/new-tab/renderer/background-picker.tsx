import { useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { NewTabState } from '../../../shared/contracts/new-tab';
import { browserClient } from '../../../renderer/client/browser-client';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { IconButton } from '../../../renderer/components/icon-button';
import { Modal } from '../../../renderer/components/modal';

const gradients = ['dusk', 'ocean', 'forest', 'sunrise'] as const;
const gradientLabels = { dusk: '暮色', ocean: '海洋', forest: '森林', sunrise: '日出' };

export function BackgroundPicker({ state, open, onOpenChange, onState }: {
  state: NewTabState; open: boolean; onOpenChange: (open: boolean) => void; onState: (state: NewTabState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(operation: () => Promise<NewTabState>) {
    setBusy(true); setError('');
    try { onState(await operation()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  return (
    <Modal title="自定义新标签页" open={open} onOpenChange={onOpenChange}>
      <div className="background-swatches">
        {gradients.map((gradient) => (
          <button type="button" key={gradient} className={`background-swatch gradient-${gradient}`} title={gradientLabels[gradient]}
            aria-label={gradientLabels[gradient]} aria-pressed={state.preferences.background.kind === 'gradient' && state.preferences.background.value === gradient}
            disabled={busy} onClick={() => void run(() => browserClient.command('newTab.update', { background: { kind: 'gradient', value: gradient } }))} />
        ))}
        <label className="color-picker-label">纯色<input type="color" aria-label="背景颜色"
          value={state.preferences.background.kind === 'color' ? state.preferences.background.value : '#201740'}
          disabled={busy} onChange={(event) => void run(() => browserClient.command('newTab.update', { background: { kind: 'color', value: event.target.value } }))} /></label>
      </div>
      <button className="button" type="button" disabled={busy} onClick={() => void run(() => browserClient.command('newTab.chooseBackground', {}))}><ImagePlus size={16} />选择本地图片</button>
      <div className="background-images">
        {state.images.map((image) => (
          <div key={image.id}>
            <button type="button" disabled={busy} title={image.name} onClick={() => void run(() => browserClient.command('newTab.update', { background: { kind: 'image', value: image.id } }))}><img src={image.dataUrl} alt={image.name} /></button>
            <IconButton label={`移除 ${image.name}`} disabled={busy} onClick={() => void run(() => browserClient.command('newTab.removeBackground', { id: image.id }))}><Trash2 size={14} /></IconButton>
          </div>
        ))}
      </div>
      <label className="new-tab-switch"><input type="checkbox" checked={state.preferences.showClock} disabled={busy}
        onChange={(event) => void run(() => browserClient.command('newTab.update', { showClock: event.target.checked }))} />显示时钟</label>
      <label className="new-tab-switch"><input type="checkbox" checked={state.preferences.showShortcuts} disabled={busy}
        onChange={(event) => void run(() => browserClient.command('newTab.update', { showShortcuts: event.target.checked }))} />显示快捷项</label>
      {error && <ErrorNotice message={error} />}
    </Modal>
  );
}
