import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  readonly collapsed: boolean;
  readonly setCollapsed: (collapsed: boolean) => void;
  readonly toggle: () => void;
}

export const sidebarStorageKey = 'celesnity.sidebar';

/**
 * Interaction state only: whether the workspace sidebar is reduced to its icon
 * rail. Persisted because a collapsed rail is a working preference, not a
 * per-visit choice — reopening the app with the rail expanded again undoes the
 * space the user deliberately reclaimed.
 *
 * `skipHydration` keeps the first client render identical to the server render;
 * `WorkspaceShell` rehydrates from storage inside an effect, which is what
 * `locale.store.ts` does and what avoids a hydration mismatch.
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    {
      name: sidebarStorageKey,
      partialize: (state) => ({ collapsed: state.collapsed }),
      merge: (persisted, current) => {
        const candidate = (persisted as { collapsed?: unknown } | undefined)?.collapsed;
        return {
          ...current,
          collapsed: typeof candidate === 'boolean' ? candidate : current.collapsed,
        };
      },
      skipHydration: true,
    },
  ),
);
