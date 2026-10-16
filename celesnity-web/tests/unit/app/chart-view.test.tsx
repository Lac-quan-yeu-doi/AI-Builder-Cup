// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChartView } from '@/app/_components/shared/chart-view';
import type { ChartViewModel } from '@/src/entities/models/chart-renderer';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

const base: ChartViewModel = {
  mark: 'BAR',
  rows: [
    { quarter: 'Q1', west: 10, east: 20 },
    { quarter: 'Q2', west: 30, east: 40 },
  ],
  series: [
    { key: 'west', label: 'west', color: 'var(--mchart-1)' },
    { key: 'east', label: 'east', color: 'var(--mchart-2)' },
  ],
  x: { dataKey: 'quarter', visible: true, gridlines: true },
  y: { visible: true, gridlines: true },
  showLegend: true,
  stacked: false,
  orientation: 'VERTICAL',
  markers: false,
};

/**
 * Recharts measures its container through `ResizeObserver` and
 * `getBoundingClientRect`, and jsdom supplies neither a real observer nor a
 * non-zero box — so `ResponsiveContainer` would render an empty shell. Report a
 * fixed size for the duration of a test.
 */
function withSize(width = 600, height = 320) {
  const originalObserver = globalThis.ResizeObserver;
  const originalRect = Element.prototype.getBoundingClientRect;
  const descriptors = Object.getOwnPropertyDescriptors(HTMLElement.prototype);

  class ImmediateResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      this.callback(
        [{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve(): void {}
    disconnect(): void {}
  }

  globalThis.ResizeObserver = ImmediateResizeObserver as unknown as typeof ResizeObserver;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 } as DOMRect;
  };
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, value: width },
    offsetHeight: { configurable: true, value: height },
  });

  return () => {
    globalThis.ResizeObserver = originalObserver;
    Element.prototype.getBoundingClientRect = originalRect;
    Object.defineProperties(HTMLElement.prototype, descriptors);
  };
}

describe('ChartView', () => {
  it('exposes the chart to assistive tech with its own label', () => {
    renderUi(<ChartView view={base} ariaLabel="Revenue by quarter" />);
    expect(screen.getByRole('img', { name: 'Revenue by quarter' })).toBeTruthy();
  });

  it('falls back to naming the chart by its mark', () => {
    renderUi(<ChartView view={base} />);
    expect(screen.getByRole('img', { name: 'bar chart' })).toBeTruthy();
  });

  it('keeps the responsive chart at the full width of its parent', () => {
    renderUi(<ChartView view={base} />);
    expect(screen.getByRole('img', { name: 'bar chart' }).className).toContain('min-w-0');
  });

  it('renders SVG carrying palette tokens rather than literal colours', () => {
    const restore = withSize();
    try {
      const { container } = renderUi(<ChartView view={base} />);
      expect(container.querySelector('svg')).toBeTruthy();

      // The legend draws its own swatch SVGs, so assert over the whole tree.
      const markup = container.innerHTML;
      // The whole reason for leaving Vega: the marks reference the theme.
      expect(markup).toContain('var(--mchart-1)');
      expect(markup).toContain('var(--mchart-2)');
      expect(markup).not.toMatch(/#[0-9a-fA-F]{6}/);
    } finally {
      restore();
    }
  });

  it('draws every mark kind without throwing', () => {
    const restore = withSize();
    try {
      for (const mark of ['BAR', 'LINE', 'AREA', 'SCATTER', 'PIE'] as const) {
        const view: ChartViewModel = {
          ...base,
          mark,
          ...(mark === 'PIE'
            ? { categoryKey: 'quarter', y: { dataKey: 'west', visible: true, gridlines: false } }
            : {}),
          ...(mark === 'SCATTER' ? { y: { dataKey: 'west', visible: true, gridlines: true } } : {}),
        };
        const { container, unmount } = renderUi(<ChartView view={view} />);
        expect(container.querySelector('svg')).toBeTruthy();
        unmount();
      }
    } finally {
      restore();
    }
  });
});
