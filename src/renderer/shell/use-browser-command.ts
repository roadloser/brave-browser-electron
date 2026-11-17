import { useCallback } from 'react';
import type { CommandInput, CommandName } from '../../shared/contracts/envelope';
import { browserClient } from '../client/browser-client';
import { useBrowserStore } from './browser-store';

export function useBrowserCommand() {
  return useCallback(<Name extends CommandName>(name: Name, payload: CommandInput<Name>) => {
    return browserClient.command(name, payload).catch((error: unknown) => {
      useBrowserStore.getState().reportError(error);
    });
  }, []);
}
