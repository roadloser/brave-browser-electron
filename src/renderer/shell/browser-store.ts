import { create } from 'zustand';
import type { BrowserSnapshot } from '../../shared/contracts/browser-core';

type BrowserStore = {
  snapshot: BrowserSnapshot | null;
  error: string | null;
  overlays: number;
  acceptSnapshot: (snapshot: BrowserSnapshot) => void;
  reportError: (error: unknown) => void;
  clearError: () => void;
  holdOverlay: () => () => void;
};

export const useBrowserStore = create<BrowserStore>((set) => ({
  snapshot: null,
  error: null,
  overlays: 0,
  acceptSnapshot: (snapshot) => set((state) =>
    !state.snapshot || snapshot.revision >= state.snapshot.revision ? { snapshot } : state),
  reportError: (error) => set({ error: error instanceof Error ? error.message : String(error) }),
  clearError: () => set({ error: null }),
  holdOverlay: () => {
    let released = false;
    set((state) => ({ overlays: state.overlays + 1 }));
    return () => {
      if (released) return;
      released = true;
      set((state) => ({ overlays: Math.max(0, state.overlays - 1) }));
    };
  },
}));
