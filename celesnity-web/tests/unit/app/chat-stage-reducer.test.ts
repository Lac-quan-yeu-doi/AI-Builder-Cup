import { describe, expect, it } from 'vitest';

import {
  EMPTY_STAGE,
  stageReducer,
} from '@/app/(workspace)/chat/_components/stage/chat-stage.reducer';
import type {
  Artifact,
  Pane,
  Stage,
} from '@/app/(workspace)/chat/_components/stage/chat-stage.types';

const chart: Artifact = { id: 'chart-1', kind: 'chart', title: 'Output per line', meta: 'Chart' };
const table: Artifact = { id: 'table-1', kind: 'table', title: 'Late orders', meta: 'Table' };

/** `noUncheckedIndexedAccess` makes every array index `T | undefined` — this
 * asserts the pane a test expects to exist actually does, instead of a
 * non-null assertion. */
function pane(stage: Stage, ci: number, pi = 0): Pane {
  const found = stage.columns[ci]?.panes[pi];
  if (!found) throw new Error(`expected column ${ci} pane ${pi} to exist`);
  return found;
}

describe('stageReducer', () => {
  it('open on an empty stage creates one column with one pane', () => {
    const stage = stageReducer(EMPTY_STAGE, { type: 'open', artifact: chart });
    expect(stage.columns).toHaveLength(1);
    expect(stage.columns[0]?.panes).toHaveLength(1);
    const p = pane(stage, 0);
    expect(p.tabs).toEqual([chart]);
    expect(stage.focused).toBe(p.id);
    expect(stage.open).toBe(true);
  });

  it('open on an already-open artifact focuses its pane instead of duplicating it', () => {
    let stage = stageReducer(EMPTY_STAGE, { type: 'open', artifact: chart });
    stage = stageReducer(stage, { type: 'open', artifact: table, placement: 'right' });
    const chartPaneId = pane(stage, 0).id;
    stage = stageReducer(stage, { type: 'open', artifact: chart });
    expect(stage.columns).toHaveLength(2);
    expect(stage.focused).toBe(chartPaneId);
  });

  it('open with placement "focus" adds a tab to the focused pane instead of splitting', () => {
    let stage = stageReducer(EMPTY_STAGE, { type: 'open', artifact: chart });
    stage = stageReducer(stage, { type: 'open', artifact: table, placement: 'focus' });
    expect(stage.columns).toHaveLength(1);
    expect(stage.columns[0]?.panes).toHaveLength(1);
    const p = pane(stage, 0);
    expect(p.tabs.map((tab) => tab.id)).toEqual(['chart-1', 'table-1']);
    expect(p.activeId).toBe('table-1');
  });

  it('split moves the tab into a new pane in the given direction and cleans up an emptied pane', () => {
    let stage = stageReducer(EMPTY_STAGE, { type: 'open', artifact: chart });
    const paneId = pane(stage, 0).id;
    stage = stageReducer(stage, { type: 'open', artifact: table, placement: 'focus' });
    stage = stageReducer(stage, { type: 'split', paneId, tabId: 'table-1', dir: 'right' });
    expect(stage.columns).toHaveLength(2);
    expect(pane(stage, 0).tabs.map((tab) => tab.id)).toEqual(['chart-1']);
    expect(pane(stage, 1).tabs.map((tab) => tab.id)).toEqual(['table-1']);
  });

  it('closeTab removes the tab and falls back to the previous tab as active', () => {
    let stage = stageReducer(EMPTY_STAGE, { type: 'open', artifact: chart });
    const paneId = pane(stage, 0).id;
    stage = stageReducer(stage, { type: 'open', artifact: table, placement: 'focus' });
    stage = stageReducer(stage, { type: 'closeTab', paneId, tabId: 'table-1' });
    const p = pane(stage, 0);
    expect(p.tabs.map((tab) => tab.id)).toEqual(['chart-1']);
    expect(p.activeId).toBe('chart-1');
  });

  it('closeTab on the last tab in a pane removes the pane and the column, and clears focus/maximized', () => {
    const stage0 = stageReducer(EMPTY_STAGE, { type: 'open', artifact: chart });
    const paneId = pane(stage0, 0).id;
    const maximized = stageReducer(stage0, { type: 'toggleMax', paneId });
    const stage = stageReducer(maximized, { type: 'closeTab', paneId, tabId: 'chart-1' });
    expect(stage.columns).toHaveLength(0);
    expect(stage.focused).toBeNull();
    expect(stage.maximized).toBeNull();
    expect(stage.open).toBe(false);
  });

  it('toggleMax sets and then clears maximized on the same pane', () => {
    const stage0 = stageReducer(EMPTY_STAGE, { type: 'open', artifact: chart });
    const paneId = pane(stage0, 0).id;
    const maximized = stageReducer(stage0, { type: 'toggleMax', paneId });
    expect(maximized.maximized).toBe(paneId);
    const restored = stageReducer(maximized, { type: 'toggleMax', paneId });
    expect(restored.maximized).toBeNull();
  });

  it('setOpen cannot force open a stage with no panes', () => {
    const stage = stageReducer(EMPTY_STAGE, { type: 'setOpen', open: true });
    expect(stage.open).toBe(false);
  });

  it('load replaces the whole stage verbatim', () => {
    const loaded: Stage = { columns: [], focused: null, maximized: null, open: false };
    const stage = stageReducer(EMPTY_STAGE, { type: 'load', stage: loaded });
    expect(stage).toBe(loaded);
  });
});
