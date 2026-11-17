import { useEffect, useState } from 'react';
import type { SettingsState } from '../../shared/contracts/settings';
import { browserClient } from '../client/browser-client';
import { useBrowserStore } from './browser-store';

export function useShellSettings(profileId: string | undefined) {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    const accept = (next: SettingsState) => {
      if (!alive) return;
      setSettings((current) => !current || next.revision >= current.revision ? next : current);
    };
    setSettings(null);
    const dispose = browserClient.on('settings.changed', accept);
    browserClient.command('settings.get', {}).then(accept).catch(useBrowserStore.getState().reportError);
    return () => { alive = false; dispose(); };
  }, [profileId]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.values.theme ?? 'system';
  }, [settings?.values.theme]);
  return settings?.values;
}
