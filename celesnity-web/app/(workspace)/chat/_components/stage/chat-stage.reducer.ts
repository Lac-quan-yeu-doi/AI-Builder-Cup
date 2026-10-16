import type { Artifact, Column, Pane, Placement, Stage, StageAction } from './chat-stage.types';

export const EMPTY_STAGE: Stage = { columns: [], focused: null, maximized: null, open: false };

let sequence = 0;
const uid = (prefix: string): string => `${prefix}-${++sequence}`;

function locate(stage: Stage, paneId: string): { ci: number; pi: number } | null {
  for (let ci = 0; ci < stage.columns.length; ci++) {
    const pi = (stage.columns[ci]?.panes ?? []).findIndex((pane) => pane.id === paneId);
    if (pi >= 0) return { ci, pi };
  }
  return null;
}

function findTab(stage: Stage, tabId: string): Pane | null {
  for (const column of stage.columns) {
    for (const pane of column.panes) {
      if (pane.tabs.some((tab) => tab.id === tabId)) return pane;
    }
  }
  return null;
}

function cleanup(stage: Stage): Stage {
  const columns = stage.columns
    .map((column) => ({ ...column, panes: column.panes.filter((pane) => pane.tabs.length > 0) }))
    .filter((column) => column.panes.length > 0);
  const ids = new Set(columns.flatMap((column) => column.panes.map((pane) => pane.id)));
  const focused =
    stage.focused && ids.has(stage.focused) ? stage.focused : (columns[0]?.panes[0]?.id ?? null);
  const maximized = stage.maximized && ids.has(stage.maximized) ? stage.maximized : null;
  return { columns, focused, maximized, open: columns.length > 0 && stage.open };
}

/** Adds a tab that is not yet open, at the placement, relative to the focused pane. */
function place(stage: Stage, tab: Artifact, placement: Placement): Stage {
  const at = stage.focused ? locate(stage, stage.focused) : null;
  if (!at) {
    const pane: Pane = { id: uid('pane'), tabs: [tab], activeId: tab.id };
    return {
      ...stage,
      columns: [...stage.columns, { id: uid('col'), panes: [pane] }],
      focused: pane.id,
      open: true,
    };
  }
  const targetColumn = stage.columns[at.ci];
  const targetPane = targetColumn?.panes[at.pi];
  if (!targetColumn || !targetPane) return stage;

  if (placement === 'focus') {
    const updatedPane: Pane = { ...targetPane, tabs: [...targetPane.tabs, tab], activeId: tab.id };
    const panes = targetColumn.panes.map((pane, pi) => (pi === at.pi ? updatedPane : pane));
    const columns = stage.columns.map((column, ci) =>
      ci === at.ci ? { ...column, panes } : column,
    );
    return { ...stage, columns, open: true };
  }

  const pane: Pane = { id: uid('pane'), tabs: [tab], activeId: tab.id };
  if (placement === 'right') {
    const columns: Column[] = [...stage.columns];
    columns.splice(at.ci + 1, 0, { id: uid('col'), panes: [pane] });
    return { ...stage, columns, focused: pane.id, open: true };
  }
  const panes: Pane[] = [...targetColumn.panes];
  panes.splice(at.pi + 1, 0, pane);
  const columns = stage.columns.map((column, ci) => (ci === at.ci ? { ...column, panes } : column));
  return { ...stage, columns, focused: pane.id, open: true };
}

function mapPane(stage: Stage, paneId: string, fn: (pane: Pane) => Pane): Stage {
  return {
    ...stage,
    columns: stage.columns.map((column) => ({
      ...column,
      panes: column.panes.map((pane) => (pane.id === paneId ? fn(pane) : pane)),
    })),
  };
}

export function stageReducer(stage: Stage, action: StageAction): Stage {
  switch (action.type) {
    case 'open': {
      const holder = findTab(stage, action.artifact.id);
      if (holder) {
        const next = mapPane(stage, holder.id, (pane) => ({
          ...pane,
          activeId: action.artifact.id,
        }));
        return {
          ...next,
          focused: holder.id,
          maximized: stage.maximized ? holder.id : null,
          open: true,
        };
      }
      return cleanup(
        place({ ...stage, maximized: null }, action.artifact, action.placement ?? 'focus'),
      );
    }
    case 'activate':
      return {
        ...mapPane(stage, action.paneId, (pane) => ({ ...pane, activeId: action.tabId })),
        focused: action.paneId,
      };
    case 'closeTab':
      return cleanup(
        mapPane(stage, action.paneId, (pane) => {
          const tabs = pane.tabs.filter((tab) => tab.id !== action.tabId);
          const index = pane.tabs.findIndex((tab) => tab.id === action.tabId);
          const activeId =
            pane.activeId === action.tabId
              ? (tabs[Math.max(0, index - 1)]?.id ?? tabs[0]?.id ?? '')
              : pane.activeId;
          return { ...pane, tabs, activeId };
        }),
      );
    case 'closeOthers':
      return mapPane(stage, action.paneId, (pane) => ({
        ...pane,
        tabs: pane.tabs.filter((tab) => tab.id === action.tabId),
        activeId: action.tabId,
      }));
    case 'closePane':
      return cleanup(mapPane(stage, action.paneId, (pane) => ({ ...pane, tabs: [] })));
    case 'toggleMax':
      return {
        ...stage,
        maximized: stage.maximized === action.paneId ? null : action.paneId,
        focused: action.paneId,
      };
    case 'split': {
      const from = stage.columns
        .flatMap((column) => column.panes)
        .find((pane) => pane.id === action.paneId);
      const tab = from?.tabs.find((entry) => entry.id === action.tabId);
      if (!from || !tab) return stage;
      const removed = stageReducer(
        { ...stage, maximized: null },
        { type: 'closeTab', paneId: action.paneId, tabId: action.tabId },
      );
      const anchor = locate(removed, action.paneId) ? action.paneId : removed.focused;
      return cleanup(place({ ...removed, focused: anchor }, tab, action.dir));
    }
    case 'focus':
      return stage.focused === action.paneId ? stage : { ...stage, focused: action.paneId };
    case 'setOpen':
      return { ...stage, open: action.open && stage.columns.length > 0 };
    case 'load':
      return action.stage;
  }
}
