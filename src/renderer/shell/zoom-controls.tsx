import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { browserClient } from '../client/browser-client';
import { IconButton } from '../components/icon-button';
import { useBrowserStore } from './browser-store';

export function ZoomControls({ tabId, active }: { tabId: string | undefined; active: boolean }) {
  const [factor, setFactor] = useState(1);
  useEffect(() => {
    if (active && tabId) browserClient.command('browser.getZoom', { tabId }).then((result) => setFactor(result.factor)).catch(useBrowserStore.getState().reportError);
  }, [tabId, active]);
  const zoom = (action: 'in' | 'out' | 'reset') => {
    if (tabId) browserClient.command('browser.zoom', { tabId, action }).then((result) => setFactor(result.factor)).catch(useBrowserStore.getState().reportError);
  };
  return (
    <div className="zoom-controls"><span>缩放</span><IconButton label="缩小" disabled={!tabId} onClick={() => zoom('out')}><Minus size={15} /></IconButton>
      <button type="button" className="zoom-reset" onClick={() => zoom('reset')} disabled={!tabId}>{Math.round(factor * 100)}%</button>
      <IconButton label="放大" disabled={!tabId} onClick={() => zoom('in')}><Plus size={15} /></IconButton></div>
  );
}
