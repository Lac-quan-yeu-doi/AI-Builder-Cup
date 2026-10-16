// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chartExportRootAttribute,
  exportChart,
} from '@/app/(workspace)/chat/_components/chart-export';

const definition = {
  chartType: 'bar',
  encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
  data: [{ region: 'west', revenue: 12 }],
};

/** Stands in for a rendered Recharts chart the exporter can find and serialise. */
function mountChart(chartId: string): HTMLElement {
  const host = document.createElement('div');
  Object.entries(chartExportRootAttribute(chartId)).forEach(([name, value]) =>
    host.setAttribute(name, value),
  );
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  // What a Recharts bar actually carries: a token, not a literal.
  rect.setAttribute('fill', 'var(--mchart-1)');
  svg.appendChild(rect);
  host.appendChild(svg);
  document.body.appendChild(host);
  return host;
}

describe('exportChart', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let anchors: HTMLAnchorElement[];

  beforeEach(() => {
    anchors = [];
    document.body.innerHTML = '';
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchors.push(this);
    });
    createObjectURLSpy = vi.fn(() => 'blob:mock-url');
    URL.createObjectURL = createObjectURLSpy as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('downloads the chart definition as JSON, named after the chart title', async () => {
    await exportChart('chart-1', 'Revenue by Region', 'json', definition);

    expect(anchors).toHaveLength(1);
    // No longer `.vl.json`: what is exported is the definition Core stores, not
    // the Vega spec that used to be derived from it.
    expect(anchors[0]?.download).toBe('revenue-by-region.chart.json');
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
  });

  it('does not need a rendered chart to export JSON', async () => {
    await expect(exportChart('absent', 'No Render', 'json', definition)).resolves.toBeUndefined();
    expect(anchors[0]?.download).toBe('no-render.chart.json');
  });

  it('serialises the live SVG for an SVG export', async () => {
    mountChart('chart-1');
    await exportChart('chart-1', 'Revenue by Region', 'svg', definition);

    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.download).toBe('revenue-by-region.svg');
  });

  it('fails clearly when there is no rendered chart to serialise', async () => {
    await expect(exportChart('missing', 'Gone', 'svg', definition)).rejects.toThrow(
      'No rendered chart to export',
    );
  });

  it('falls back to "chart" when the title has no usable characters', async () => {
    await exportChart('chart-1', '   ***   ', 'json', definition);
    expect(anchors[0]?.download).toBe('chart.chart.json');
  });
});
