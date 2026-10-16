// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { VisualizationTypePicker } from '@/app/(workspace)/charts/_components/visualization/visualization-type-picker';
import { createDefaultVisualization } from '@/src/entities/models/canonical-chart';

afterEach(cleanup);

describe('VisualizationTypePicker', () => {
  it('uses icon-labelled chart buttons and reports the selected type', () => {
    const onChange = vi.fn();
    renderUi(<VisualizationTypePicker type="BAR" onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Bar' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Pie' }));
    expect(onChange).toHaveBeenCalledWith(createDefaultVisualization('PIE'));
  });
});
