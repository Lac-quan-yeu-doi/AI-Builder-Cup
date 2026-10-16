// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import {
  createDefaultVisualization,
  type VisualizationDefinition,
} from '@/src/entities/models/canonical-chart';
import { VisualizationSeriesPopover } from '@/app/(workspace)/charts/_components/visualization/visualization-series-popover';

afterEach(cleanup);

function Harness() {
  const [definition, setDefinition] = React.useState<VisualizationDefinition>({
    ...createDefaultVisualization('BAR'),
    roles: { category: 'region', measures: ['revenue'] },
  });
  return (
    <VisualizationSeriesPopover series="revenue" definition={definition} onChange={setDefinition} />
  );
}

describe('VisualizationSeriesPopover', () => {
  it('exposes Metabase-style Style and Formatting tabs', () => {
    renderUi(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'revenue series settings' }));

    expect(screen.getByRole('tab', { name: 'Style' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Formatting' })).toBeTruthy();
    expect(screen.getByLabelText('revenue color')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Formatting' }));
    expect(screen.getByLabelText('revenue decimal places')).toBeTruthy();
    expect(screen.getByLabelText('revenue prefix')).toBeTruthy();
    expect(screen.getByLabelText('revenue suffix')).toBeTruthy();
    expect(screen.getByLabelText('revenue compact notation')).toBeTruthy();
  });
});
