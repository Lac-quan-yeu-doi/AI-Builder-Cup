// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import {
  EMPTY_STAGE,
  stageReducer,
} from '@/app/(workspace)/chat/_components/stage/chat-stage.reducer';
import { ChatStageShell } from '@/app/(workspace)/chat/_components/stage/chat-stage-shell';
import type { Artifact, Stage } from '@/app/(workspace)/chat/_components/stage/chat-stage.types';

afterEach(cleanup);

const chart: Artifact = {
  id: 'chart-1',
  kind: 'chart',
  title: 'Output per line',
  meta: 'Chart · production_runs',
};
const table: Artifact = {
  id: 'table-1',
  kind: 'table',
  title: 'Late orders',
  meta: 'Table · 6 rows',
};

function stageWith(...artifacts: Artifact[]): Stage {
  return artifacts.reduce(
    (stage, artifact) => stageReducer(stage, { type: 'open', artifact, placement: 'right' }),
    EMPTY_STAGE,
  );
}

describe('ChatStageShell', () => {
  /*
   * `ring-ring` is the keyboard-focus token. Marking the active pane with it
   * meant a lone pane wore a blue edge that answered a question nobody had
   * asked, and a control inside the pane could no longer be told apart from
   * the pane itself when tabbed to.
   */
  function panes(): readonly HTMLElement[] {
    return [...document.querySelectorAll('[data-pane-frame]')] as HTMLElement[];
  }

  it('marks no pane when there is only one, because there is no choice to show', () => {
    render(
      createElement(ChatStageShell, {
        stage: stageWith(chart),
        dispatch: vi.fn(),
        renderPane: () => null,
      }),
    );

    const [only] = panes();
    expect(only?.className).not.toMatch(/ring-ring/u);
    expect(only?.className).not.toMatch(/border-primary/u);
  });

  it('marks the pane the next artifact opens into once there are two', () => {
    render(
      createElement(ChatStageShell, {
        stage: stageWith(chart, table),
        dispatch: vi.fn(),
        renderPane: () => null,
      }),
    );

    const marked = panes().filter((pane) => /border-primary/u.test(pane.className));
    expect(marked).toHaveLength(1);
    /* And never through the focus ring, whatever the count. */
    expect(panes().some((pane) => /ring-ring/u.test(pane.className))).toBe(false);
  });

  it('marks nothing while one pane is maximized', () => {
    const stage = stageWith(chart, table);
    const maximized = stageReducer(stage, {
      type: 'toggleMax',
      paneId: stage.columns[0]?.panes[0]?.id ?? '',
    });
    render(
      createElement(ChatStageShell, {
        stage: maximized,
        dispatch: vi.fn(),
        renderPane: () => null,
      }),
    );

    expect(panes()).toHaveLength(1);
    expect(panes()[0]?.className).not.toMatch(/border-primary/u);
  });

  it('renders a tab per open artifact and calls renderPane for the active one', () => {
    const dispatch = vi.fn();
    const renderPane = vi.fn((artifact: Artifact) =>
      createElement('div', { 'data-testid': `pane-content-${artifact.id}` }),
    );
    render(createElement(ChatStageShell, { stage: stageWith(chart, table), dispatch, renderPane }));
    expect(screen.getByText('Output per line')).toBeTruthy();
    expect(screen.getByText('Late orders')).toBeTruthy();
    expect(renderPane).toHaveBeenCalledWith(chart);
    expect(renderPane).toHaveBeenCalledWith(table);
  });

  /*
   * With more than one thing open, the switches sit in a row right under the
   * pane's header as numbered buttons, in opening order, and pressing one is
   * reported so the transcript can scroll to where that artifact was made.
   */
  it('lists open artifacts as numbered buttons under the header and reports the one pressed', () => {
    const dispatch = vi.fn();
    const onActivate = vi.fn();
    render(
      createElement(ChatStageShell, {
        stage: stageWith(chart, table),
        dispatch,
        renderPane: () => null,
        onActivate,
      }),
    );

    const strips = document.querySelectorAll('[data-slot="pane-tabs"]');
    expect(strips).toHaveLength(0); /* two panes, one tab each: nothing to switch */

    const onePane = stageReducer(stageWith(chart), { type: 'open', artifact: table });
    cleanup();
    render(
      createElement(ChatStageShell, {
        stage: onePane,
        dispatch,
        renderPane: () => null,
        onActivate,
      }),
    );
    const strip = document.querySelector('[data-slot="pane-tabs"]');
    expect(strip).not.toBeNull();
    /* Right under the header, before the content. */
    expect(strip?.previousElementSibling?.tagName).toBe('HEADER');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['1Output per line', '2Late orders']);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(tabs[0]!);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'activate', tabId: chart.id }),
    );
    expect(onActivate).toHaveBeenCalledWith(chart);
  });

  it('clicking a pane close button dispatches closePane', () => {
    const dispatch = vi.fn();
    render(
      createElement(ChatStageShell, {
        stage: stageWith(chart),
        dispatch,
        renderPane: () => createElement('div'),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close pane' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'closePane' }));
  });

  it('renders nothing when the stage has no panes', () => {
    const { container } = render(
      createElement(ChatStageShell, {
        stage: EMPTY_STAGE,
        dispatch: vi.fn(),
        renderPane: () => null,
      }),
    );
    expect(container.innerHTML).toBe('');
  });

  it('marks single and multi-pane stages for distinct surface treatment', () => {
    const { container, rerender } = render(
      createElement(ChatStageShell, {
        stage: stageWith(chart),
        dispatch: vi.fn(),
        renderPane: () => createElement('div'),
      }),
    );
    expect(container.querySelector('[data-stage-layout="single"]')).toBeTruthy();

    rerender(
      createElement(ChatStageShell, {
        stage: stageWith(chart, table),
        dispatch: vi.fn(),
        renderPane: () => createElement('div'),
      }),
    );
    expect(container.querySelector('[data-stage-layout="multi"]')).toBeTruthy();
  });
});
