// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import {
  createDefaultVisualization,
  type VisualizationDefinition,
} from '@/src/entities/models/canonical-chart';
import { VisualizationWorkspace } from '@/app/(workspace)/charts/_components/visualization/visualization-workspace';

afterEach(cleanup);

const fields = [
  { name: 'status', type: 'VARCHAR', family: 'STRING' as const },
  { name: 'revenue', type: 'DOUBLE', family: 'NUMBER' as const },
  { name: 'created_at', type: 'DATE', family: 'DATE' as const },
];

function Harness() {
  const [definition, setDefinition] = React.useState<VisualizationDefinition>(
    createDefaultVisualization('BAR'),
  );
  return (
    <VisualizationWorkspace definition={definition} fields={fields} onChange={setDefinition} />
  );
}

describe('VisualizationWorkspace', () => {
  it('uses the grouped query-result picker for chart roles', () => {
    renderUi(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'X-axis field' }));
    expect(
      screen.getByRole('button', { name: 'Query result fields' }).getAttribute('aria-expanded'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: 'Status' }));
    expect(screen.getByRole('button', { name: 'X-axis field' }).textContent).toContain('Status');
    expect(document.querySelector('select[multiple]')).toBeNull();
  });

  it('switches role controls with the chart type', () => {
    renderUi(<Harness />);
    expect(screen.getByRole('button', { name: 'X-axis field' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Y-axis field' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pie' }));
    expect(screen.getByRole('button', { name: 'Measure field' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Breakout field' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'X-axis field' })).toBeNull();
  });
});
