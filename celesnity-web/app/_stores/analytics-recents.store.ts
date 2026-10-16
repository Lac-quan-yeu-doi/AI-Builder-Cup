import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type RecentObjectKind = 'CHART' | 'DASHBOARD';

export interface RecentObject {
  readonly id: string;
  readonly kind: RecentObjectKind;
  readonly at: number;
}

export interface RecentTable {
  readonly catalog: string;
  readonly schema: string;
  readonly table: string;
  readonly at: number;
}

interface AnalyticsRecentsState {
  readonly objects: readonly RecentObject[];
  readonly tables: readonly RecentTable[];
  readonly noteObject: (id: string, kind: RecentObjectKind) => void;
  readonly noteTable: (table: Omit<RecentTable, 'at'>) => void;
  readonly clear: () => void;
}

export const analyticsRecentsStorageKey = 'celesnity.analytics.recents';

/**
 * `localStorage` is not always there and not always whole: a private window, a
 * viewer who blocked site data, or this repo's own test runtime (which starts
 * Node with `--no-experimental-webstorage`, leaving an object with no
 * `setItem`). A convenience must never be able to break the thing it decorates
 * — writing a recent table cannot be allowed to swallow the table you just
 * picked — so every access is guarded and falls back to memory.
 */
function safeStorage(): Storage {
  const memory = new Map<string, string>();
  const usable = (() => {
    try {
      const probe = `${analyticsRecentsStorageKey}.probe`;
      globalThis.localStorage?.setItem(probe, '1');
      globalThis.localStorage?.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  })();
  if (usable) return globalThis.localStorage;
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
    clear: () => memory.clear(),
    key: (index) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size;
    },
  } satisfies Storage;
}

/** Past this a "recent" list is just the library again, in a worse order. */
const LIMIT = 12;

function tableId(table: Omit<RecentTable, 'at'>): string {
  return `${table.catalog}.${table.schema}.${table.table}`;
}

/**
 * What this browser opened last, so the library can lead with it and the
 * question builder can offer a table you already work with.
 *
 * Recency is the one ranking signal Core does not keep, and it is the strongest
 * one there is: analytics workspaces are overwhelmingly re-visits. Holding it
 * here keeps the change interface-only — no endpoint, no schema, no per-user
 * server state — at the price of it being per-browser, which is the right
 * trade for a convenience that must never be the only route to anything.
 *
 * Everything below it therefore has to stand on its own: on a fresh browser
 * both lists are empty and neither section renders.
 *
 * `skipHydration` keeps the first client render identical to the server's;
 * callers rehydrate inside an effect, as `sidebar.store.ts` does.
 */
export const useAnalyticsRecentsStore = create<AnalyticsRecentsState>()(
  persist(
    (set) => ({
      objects: [],
      tables: [],
      noteObject: (id, kind) =>
        set((state) => ({
          objects: [
            { id, kind, at: Date.now() },
            ...state.objects.filter((entry) => entry.id !== id),
          ].slice(0, LIMIT),
        })),
      noteTable: (table) =>
        set((state) => ({
          tables: [
            { ...table, at: Date.now() },
            ...state.tables.filter((entry) => tableId(entry) !== tableId(table)),
          ].slice(0, LIMIT),
        })),
      clear: () => set({ objects: [], tables: [] }),
    }),
    {
      name: analyticsRecentsStorageKey,
      storage: createJSONStorage(safeStorage),
      partialize: (state) => ({ objects: state.objects, tables: state.tables }),
      merge: (persisted, current) => {
        const stored = persisted as { objects?: unknown; tables?: unknown } | undefined;
        return {
          ...current,
          objects: readObjects(stored?.objects),
          tables: readTables(stored?.tables),
        };
      },
      skipHydration: true,
    },
  ),
);

/* Storage is shared with whatever wrote it last — a previous build, a hand
 * edit, another tab — so every field is checked rather than trusted. */
function readObjects(value: unknown): readonly RecentObject[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is RecentObject =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentObject).id === 'string' &&
        ((entry as RecentObject).kind === 'CHART' ||
          (entry as RecentObject).kind === 'DASHBOARD') &&
        typeof (entry as RecentObject).at === 'number',
    )
    .slice(0, LIMIT);
}

function readTables(value: unknown): readonly RecentTable[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is RecentTable =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentTable).catalog === 'string' &&
        typeof (entry as RecentTable).schema === 'string' &&
        typeof (entry as RecentTable).table === 'string' &&
        typeof (entry as RecentTable).at === 'number',
    )
    .slice(0, LIMIT);
}
