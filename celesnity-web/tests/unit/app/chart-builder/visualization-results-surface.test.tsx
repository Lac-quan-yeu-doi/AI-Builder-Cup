// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { createDefaultVisualization } from '@/src/entities/models/canonical-chart';
import { VisualizationResultsSurface } from '@/app/(workspace)/charts/_components/visualization/visualization-results-surface';
import { makeChartDraft, makeVisualQuery } from './chart-builder-test-fixtures';

afterEach(cleanup);

/** Radix activates a tab on pointer-down, not on a bare click event. */
function selectTab(name: string): void {
  fireEvent.mouseDown(screen.getByRole('tab', { name }));
}

function makeResultsSurface() {
  const onDefinitionChange = vi.fn();
  const draft = makeChartDraft({
    visualizationDefinition: {
      ...createDefaultVisualization('BAR'),
      roles: { category: 'region', measures: ['revenue'] },
    },
  });
  renderUi(
    <VisualizationResultsSurface
      draft={draft}
      rows={[
        ['west', 1250],
        ['east', 980],
      ]}
      status="SUCCEEDED"
      renderer={{ compile: vi.fn().mockReturnValue(null) }}
      onDefinitionChange={onDefinitionChange}
      onEdit={vi.fn()}
      onRefresh={vi.fn()}
      onSave={vi.fn()}
      onViewSql={vi.fn()}
      canSave
    />,
  );
  return { onDefinitionChange };
}

describe('VisualizationResultsSurface', () => {
  it('keeps the chart type in reach instead of behind a floating control', () => {
    makeResultsSurface();

    // It used to sit behind a pill labelled "Visualization" pinned to the
    // bottom of the canvas, in a panel that replaced the settings panel and
    // needed its own Done button to leave.
    expect(screen.queryByRole('button', { name: 'Visualization', exact: true })).toBeNull();
    const picker = screen.getByRole('group', { name: 'Chart type' });
    expect(within(picker).getByRole('button', { name: 'Bar' })).toBeTruthy();
    expect(within(picker).getByRole('button', { name: 'Bar' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('rules out chart types the result cannot draw, and says why', () => {
    const draft = makeChartDraft({
      visualizationDefinition: createDefaultVisualization('TABLE'),
      outputSchema: [
        { name: 'region', type: 'VARCHAR', family: 'STRING' },
        { name: 'status', type: 'VARCHAR', family: 'STRING' },
      ],
    });
    renderUi(
      <VisualizationResultsSurface
        draft={draft}
        rows={[['west', 'ok']]}
        status="SUCCEEDED"
        renderer={{ compile: vi.fn().mockReturnValue(null) }}
        onDefinitionChange={vi.fn()}
        onEdit={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const picker = screen.getByRole('group', { name: 'Chart type' });
    expect(within(picker).getByRole('button', { name: 'Table' }).hasAttribute('disabled')).toBe(
      false,
    );
    // Two text columns and no measure: a bar chart has nothing to put on an axis.
    expect(within(picker).getByRole('button', { name: 'Bar' }).hasAttribute('disabled')).toBe(true);
    expect(within(picker).getByRole('button', { name: 'Scatter' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('opens a fresh result on a shape that fits it', () => {
    const onDefinitionChange = vi.fn();
    const draft = makeChartDraft({
      visualizationDefinition: createDefaultVisualization('TABLE'),
      outputSchema: [
        { name: 'machine', type: 'VARCHAR', family: 'STRING' },
        { name: 'max_temp_c', type: 'DOUBLE', family: 'NUMBER' },
      ],
    });
    renderUi(
      <VisualizationResultsSurface
        draft={draft}
        rows={[['PRESS-A01', 61.5]]}
        status="SUCCEEDED"
        renderer={{ compile: vi.fn().mockReturnValue(null) }}
        onDefinitionChange={onDefinitionChange}
        onEdit={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    // One dimension and one measure is a bar chart. Every result used to land
    // on TABLE regardless of what came back.
    expect(onDefinitionChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'BAR' }));
  });

  it('keeps the visualization controls inside its inherited viewport boundary', () => {
    makeResultsSurface();

    const result = screen.getByRole('main', { name: 'Visualization result' });
    expect(result.className).toContain('h-full');
    expect(result.className).toContain('min-h-0');
    expect(result.className).not.toContain('min-h-screen');
    expect(screen.getByRole('group', { name: 'Chart type' })).toBeTruthy();
  });

  it('uses query-result groups for role fields without refreshing the query', () => {
    const { onDefinitionChange } = makeResultsSurface();
    const onRefresh = vi.fn();
    cleanup();
    const draft = makeChartDraft({
      visualizationDefinition: {
        ...createDefaultVisualization('BAR'),
        roles: { category: 'region', measures: ['revenue'] },
      },
    });
    renderUi(
      <VisualizationResultsSurface
        draft={draft}
        rows={[['west', 1250]]}
        status="SUCCEEDED"
        renderer={{ compile: vi.fn().mockReturnValue(null) }}
        onDefinitionChange={onDefinitionChange}
        onEdit={vi.fn()}
        onRefresh={onRefresh}
        onSave={vi.fn()}
        canSave
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'X-axis field' }));
    expect(
      screen.getByRole('button', { name: 'Query result fields' }).getAttribute('aria-expanded'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: 'Revenue' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Chart type' })).getByRole('button', {
        name: 'Pie',
      }),
    );
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('maps a visual-query breakout to X and its aggregation to Y when choosing bar', () => {
    const onDefinitionChange = vi.fn();
    const draft = makeChartDraft({
      queryDefinition: makeVisualQuery({
        aggregations: [
          {
            alias: 'count_rows',
            function: 'COUNT',
            expression: { kind: 'FIELD', relation: 'orders', field: 'id' },
          },
        ],
        breakouts: [{ kind: 'FIELD', relation: 'brands', field: 'name' }],
      }),
      visualizationDefinition: {
        ...createDefaultVisualization('TABLE'),
        roles: { columns: ['count_rows', 'name'] },
      },
      outputSchema: [
        { name: 'count_rows', type: 'BIGINT', family: 'NUMBER' },
        { name: 'name', type: 'VARCHAR', family: 'STRING' },
      ],
    });
    renderUi(
      <VisualizationResultsSurface
        draft={draft}
        rows={[
          [35, 'Thiên Thanh'],
          [29, 'Amarin'],
        ]}
        status="SUCCEEDED"
        renderer={{ compile: vi.fn().mockReturnValue(null) }}
        onDefinitionChange={onDefinitionChange}
        onEdit={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Chart type' })).getByRole('button', {
        name: 'Bar',
        exact: true,
      }),
    );

    expect(onDefinitionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BAR',
        roles: { category: 'name', measures: ['count_rows'] },
      }),
    );
  });

  it('shows Data, Display, and Axes configuration tabs', () => {
    makeResultsSurface();

    selectTab('Display');
    expect(screen.getByRole('switch', { name: 'Show values on data points' })).toBeTruthy();

    selectTab('Axes');
    expect(screen.getByRole('group', { name: 'X-axis' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Y-axis' })).toBeTruthy();
  });

  it('hides the Axes tab for chart types that have no axes', () => {
    const draft = makeChartDraft({
      visualizationDefinition: createDefaultVisualization('PIE'),
    });
    renderUi(
      <VisualizationResultsSurface
        draft={draft}
        rows={[['west', 1250]]}
        status="SUCCEEDED"
        renderer={{ compile: vi.fn().mockReturnValue(null) }}
        onDefinitionChange={vi.fn()}
        onEdit={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    // The tab used to exist for all seven types and render nothing for four.
    expect(screen.queryByRole('tab', { name: 'Axes' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Data' })).toBeTruthy();
  });

  it('provides per-series settings from the Data tab', () => {
    makeResultsSurface();
    fireEvent.click(screen.getByRole('button', { name: 'revenue series settings' }));
    expect(screen.getByRole('tab', { name: 'Style' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Formatting' })).toBeTruthy();
  });

  it('stacks the settings sheet above the canvas on narrow viewports', () => {
    makeResultsSurface();
    const settings = screen.getByRole('region', { name: 'Visualization settings' });

    expect(settings.parentElement?.className).toContain('flex-col');
  });

  it('explains that an edited visualization needs validation instead of blaming refresh', () => {
    const draft = makeChartDraft({
      visualizationDefinition: {
        ...createDefaultVisualization('BAR'),
        roles: { category: 'region', measures: ['revenue'] },
      },
    });
    renderUi(
      <VisualizationResultsSurface
        draft={draft}
        rows={[['west', 1250]]}
        status="STALE"
        renderer={{ compile: vi.fn().mockReturnValue(null) }}
        onDefinitionChange={vi.fn()}
        onEdit={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText(/visualization changed/i)).toBeTruthy();
    expect(screen.queryByText(/refresh failed/i)).toBeNull();
  });
});
