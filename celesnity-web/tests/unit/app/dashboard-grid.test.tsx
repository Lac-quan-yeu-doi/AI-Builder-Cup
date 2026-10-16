// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DashboardGrid,
  constrainDashboardGeometry,
  moveDashboardGeometry,
  resizeDashboardGeometry,
} from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-grid';
import type { DashboardCard } from '@/src/entities/models/dashboard';

const card: DashboardCard = {
  id: 'heading-1',
  tabId: 'tab-1',
  kind: 'HEADING',
  content: { text: 'Revenue' },
  geometry: { x: 0, y: 0, width: 12, height: 2 },
};
const chartCard: DashboardCard = {
  id: 'chart-1',
  tabId: 'tab-1',
  kind: 'CHART',
  chartId: 'saved-chart-1',
  chartRevisionNumber: 1,
  visualizationOverrides: {},
  geometry: { x: 0, y: 2, width: 12, height: 6 },
};

afterEach(cleanup);

describe('DashboardGrid', () => {
  it('constrains geometry to the 24-column dashboard canvas', () => {
    expect(constrainDashboardGeometry({ x: 23, y: -2, width: 12, height: 0 })).toEqual({
      x: 12,
      y: 0,
      width: 12,
      height: 1,
    });
    expect(moveDashboardGeometry(card.geometry, -1, -1)).toMatchObject({ x: 0, y: 0 });
    expect(resizeDashboardGeometry(card.geometry, 20, -4)).toMatchObject({
      width: 24,
      height: 1,
    });
  });

  it('offers keyboard move and resize controls in addition to pointer handles', () => {
    const onChange = vi.fn();
    const onDuplicate = vi.fn();
    render(
      <DashboardGrid
        cards={[card]}
        onChange={onChange}
        onRemove={vi.fn()}
        onDuplicate={onDuplicate}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move card' }), {
      key: 'ArrowRight',
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ geometry: { x: 1, y: 0, width: 12, height: 2 } }),
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize card' }), {
      key: 'ArrowDown',
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ geometry: { x: 0, y: 0, width: 12, height: 3 } }),
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Card layout options' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(onDuplicate).toHaveBeenCalledWith(card);
  });

  it('renders a supplied live chart preview inside chart cards', () => {
    render(
      <DashboardGrid
        cards={[chartCard]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        renderChart={() => <span>Rendered chart preview</span>}
      />,
    );

    expect(screen.getByText('Rendered chart preview')).toBeTruthy();
  });

  it('stretches a live chart preview to the full card width', () => {
    render(
      <DashboardGrid
        cards={[chartCard]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        renderChart={() => <span data-testid="chart-preview">Rendered chart preview</span>}
      />,
    );

    const previewContainer = screen.getByTestId('chart-preview').parentElement;
    expect(previewContainer).not.toBeNull();
    expect(previewContainer?.className).toContain('w-full');
    expect(previewContainer?.className).toContain('min-w-0');
    expect(previewContainer?.className).not.toContain('place-items-center');
  });
});
