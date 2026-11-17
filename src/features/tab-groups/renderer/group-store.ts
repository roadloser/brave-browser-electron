import { useEffect } from 'react';
import { create } from 'zustand';
import type { TabGroupsState } from '../../../shared/contracts/tab-groups';
import { browserClient } from '../../../renderer/client/browser-client';
import { useBrowserStore } from '../../../renderer/shell/browser-store';

const emptyGroups: TabGroupsState = { groups: [], revision: -1 };
const useGroupStore = create<{ state: TabGroupsState; accept: (state: TabGroupsState) => void; reset: () => void }>((set) => ({
  state: emptyGroups,
  accept: (next) => set((current) => next.revision >= current.state.revision ? { state: next } : current),
  reset: () => set({ state: emptyGroups }),
}));

export function useTabGroups(windowId: string | undefined): TabGroupsState {
  const state = useGroupStore((store) => store.state);
  useEffect(() => {
    if (!windowId) return;
    let alive = true;
    const store = useGroupStore.getState();
    store.reset();
    const unsubscribe = browserClient.on('tabGroups.changed', (next) => {
      if (alive) store.accept(next);
    });
    browserClient.command('tabGroups.list', {})
      .then((next) => { if (alive) store.accept(next); })
      .catch((error) => { if (alive) useBrowserStore.getState().reportError(error); });
    return () => { alive = false; unsubscribe(); };
  }, [windowId]);
  return state;
}
