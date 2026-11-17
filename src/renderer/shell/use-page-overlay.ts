import { useEffect } from 'react';
import { useBrowserStore } from './browser-store';

export function usePageOverlay(open: boolean) {
  useEffect(() => {
    if (open) return useBrowserStore.getState().holdOverlay();
  }, [open]);
}
