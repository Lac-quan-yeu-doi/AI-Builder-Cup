import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const assistantPanelStorageKey = 'celesnity.assistant-panel';

/**
 * One width for the whole platform, and the range a drag may reach.
 *
 * 400 is the narrowest column that still fits a proposal diff line without
 * wrapping at `text-body-sm`; the three panels this replaces had picked 360,
 * 360 and 420 independently. The floor is where the composer's own controls
 * stop fitting on one row, the ceiling is where the panel starts competing
 * with the screen it is attached to.
 */
export const assistantPanelDefaultWidth = 400;
export const assistantPanelMinWidth = 320;
export const assistantPanelMaxWidth = 560;

export function clampAssistantPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return assistantPanelDefaultWidth;
  return Math.min(assistantPanelMaxWidth, Math.max(assistantPanelMinWidth, Math.round(width)));
}

interface AssistantPanelState {
  /** Width per surface. A surface with no entry uses the default. */
  readonly widths: Readonly<Record<string, number>>;
  /**
   * Open state per surface, and only where the visitor has said so. A surface
   * declares its own default (Skills opens with the screen, a database does
   * not), so "no entry" has to stay distinct from "closed".
   */
  readonly openOverrides: Readonly<Record<string, boolean>>;
  readonly setWidth: (surface: string, width: number) => void;
  readonly setOpen: (surface: string, open: boolean) => void;
  readonly toggle: (surface: string, currentlyOpen: boolean) => void;
}

function sanitiseWidths(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' &&
      entry[1] >= assistantPanelMinWidth &&
      entry[1] <= assistantPanelMaxWidth,
  );
  return Object.fromEntries(entries);
}

function sanitiseOpen(value: unknown): Record<string, boolean> {
  if (typeof value !== 'object' || value === null) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
  );
  return Object.fromEntries(entries);
}

/**
 * Where the assistant panel sits, per surface.
 *
 * Interaction state rather than data: a width the visitor dragged is a working
 * preference, and reopening the app at 400 again undoes the space they
 * deliberately gave the panel. `skipHydration` keeps the first client render
 * equal to the server's; the panel rehydrates from an effect.
 */
export const useAssistantPanelStore = create<AssistantPanelState>()(
  persist(
    (set) => ({
      widths: {},
      openOverrides: {},
      setWidth: (surface, width) =>
        set((state) => ({
          widths: { ...state.widths, [surface]: clampAssistantPanelWidth(width) },
        })),
      setOpen: (surface, open) =>
        set((state) => ({
          openOverrides: { ...state.openOverrides, [surface]: open },
        })),
      toggle: (surface, currentlyOpen) =>
        set((state) => ({
          openOverrides: { ...state.openOverrides, [surface]: !currentlyOpen },
        })),
    }),
    {
      name: assistantPanelStorageKey,
      partialize: (state) => ({ widths: state.widths, openOverrides: state.openOverrides }),
      merge: (persisted, current) => {
        const stored = persisted as { widths?: unknown; openOverrides?: unknown } | undefined;
        return {
          ...current,
          widths: sanitiseWidths(stored?.widths),
          openOverrides: sanitiseOpen(stored?.openOverrides),
        };
      },
      skipHydration: true,
    },
  ),
);

/** The width a surface renders at, with the stored value applied if there is one. */
export function assistantPanelWidth(
  widths: Readonly<Record<string, number>>,
  surface: string,
): number {
  return clampAssistantPanelWidth(widths[surface] ?? assistantPanelDefaultWidth);
}

/** Open unless the visitor has said otherwise on this surface. */
export function assistantPanelOpen(
  overrides: Readonly<Record<string, boolean>>,
  surface: string,
  defaultOpen: boolean,
): boolean {
  return overrides[surface] ?? defaultOpen;
}
