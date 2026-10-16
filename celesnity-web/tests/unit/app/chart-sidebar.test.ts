// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChartSidebar } from '@/app/(workspace)/chat/_components/chart-sidebar';
import { renderUi } from '@/tests/support/render-ui';
import type { CreateChartController } from '@/src/interface-adapters/controllers/charts/create-chart.controller';
import type { DeleteChartController } from '@/src/interface-adapters/controllers/charts/delete-chart.controller';
import type { ListChartsController } from '@/src/interface-adapters/controllers/charts/list-charts.controller';
import type { PatchChartController } from '@/src/interface-adapters/controllers/charts/patch-chart.controller';
import type { SetChartDataFromCsvController } from '@/src/interface-adapters/controllers/charts/set-chart-data-from-csv.controller';
import type { SubscribeChartsController } from '@/src/interface-adapters/controllers/charts/subscribe-charts.controller';
import type { ChartViewModel } from '@/src/interface-adapters/presenters/chart.presenter';

const chart = (
  id: string,
  title: string,
  overrides: Partial<ChartViewModel> = {},
): ChartViewModel => ({
  id,
  runId: null,
  title,
  chartType: 'bar',
  encodings: {},
  data: [],
  config: {},
  vlSpec: null,
  sql: null,
  status: 'draft',
  errorMessage: null,
  version: 1,
  ...overrides,
});

// The kit is shadcn now: its components read from CSS variables on :root
// rather than from a provider, so a rerender needs no wrapper re-supplied.
function withMantine(node: ReturnType<typeof createElement>) {
  return node;
}

function noopControllers() {
  return {
    subscribeCharts: vi.fn(() => ({ close: vi.fn() })) as unknown as SubscribeChartsController,
    createChart: vi.fn() as unknown as CreateChartController,
    deleteChart: vi.fn() as unknown as DeleteChartController,
    setChartDataFromCsv: vi.fn() as unknown as SetChartDataFromCsvController,
  };
}

afterEach(() => {
  cleanup();
});

describe('ChartSidebar global scope', () => {
  it('loads every chart from the global charts endpoint, with no room scoping', async () => {
    const listCharts = vi.fn(async () => [
      chart('chart-a', 'Revenue by region'),
      chart('chart-b', 'Units by region'),
    ]) as unknown as ListChartsController;
    const subscribeCharts = vi.fn(() => ({
      close: vi.fn(),
    })) as unknown as SubscribeChartsController;

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart: vi.fn() as unknown as CreateChartController,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart: vi.fn() as unknown as DeleteChartController,
        setChartDataFromCsv: vi.fn() as unknown as SetChartDataFromCsvController,
      }),
    );

    await waitFor(() => {
      expect(screen.getAllByText('Revenue by region').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Units by region').length).toBeGreaterThan(0);
    });
    expect(listCharts).toHaveBeenCalledWith();
    expect(subscribeCharts).toHaveBeenCalledWith(expect.anything());
  });
});

describe('ChartSidebar provenance', () => {
  it('shows a "generated from run" link and opens the run inspector on click', async () => {
    const { subscribeCharts, createChart, deleteChart, setChartDataFromCsv } = noopControllers();
    const listCharts = vi.fn(async () => [
      chart('chart-a', 'Revenue by region', { runId: 'run-42', status: 'ready' }),
    ]) as unknown as ListChartsController;
    const onInspectRun = vi.fn();

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
        onInspectRun,
      }),
    );

    await waitFor(() => expect(screen.getAllByText('Revenue by region').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText('Revenue by region'));

    const link = await screen.findByText('Generated from run run-42');
    fireEvent.click(link);
    expect(onInspectRun).toHaveBeenCalledWith('run-42');
  });

  it('hides the provenance link when the chart has no runId', async () => {
    const { subscribeCharts, createChart, deleteChart, setChartDataFromCsv } = noopControllers();
    const listCharts = vi.fn(async () => [
      chart('chart-a', 'Revenue by region', { status: 'ready' }),
    ]) as unknown as ListChartsController;

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
        onInspectRun: vi.fn(),
      }),
    );

    await waitFor(() => expect(screen.getAllByText('Revenue by region').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText('Revenue by region'));

    await screen.findByRole('button', { name: 'Edit' });
    expect(screen.queryByText(/Generated from run/)).toBeNull();
  });
});

describe('ChartSidebar error and retry', () => {
  it('shows the error message and a retry button for a failed chart', async () => {
    const { subscribeCharts, createChart, deleteChart, setChartDataFromCsv } = noopControllers();
    const listCharts = vi.fn(async () => [
      chart('chart-a', 'Broken chart', {
        status: 'error',
        errorMessage: 'The vlSpec could not be derived.',
      }),
    ]) as unknown as ListChartsController;

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
      }),
    );

    fireEvent.click(await screen.findByText('Broken chart'));

    expect(await screen.findByText('The vlSpec could not be derived.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });

  it('resubmits the chart unchanged when retry is clicked', async () => {
    const { subscribeCharts, createChart, deleteChart, setChartDataFromCsv } = noopControllers();
    const failed = chart('chart-a', 'Broken chart', {
      status: 'error',
      errorMessage: 'boom',
      version: 3,
    });
    const listCharts = vi.fn(async () => [failed]) as unknown as ListChartsController;
    const patchChart = vi.fn().mockResolvedValue({
      ...failed,
      status: 'ready',
      errorMessage: null,
      version: 4,
    }) as unknown as PatchChartController;

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart,
        deleteChart,
        setChartDataFromCsv,
      }),
    );

    fireEvent.click(await screen.findByText('Broken chart'));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(patchChart).toHaveBeenCalledWith({
        id: 'chart-a',
        expectedVersion: 3,
        patch: {
          title: 'Broken chart',
          chartType: 'bar',
          encodings: {},
          data: [],
          config: {},
        },
      }),
    );
  });
});

describe('ChartSidebar status label', () => {
  it('names a draft chart as waiting for data, not as work in progress', async () => {
    const { subscribeCharts, createChart, deleteChart, setChartDataFromCsv } = noopControllers();
    const listCharts = vi.fn(async () => [
      chart('chart-a', 'In progress', { status: 'draft' }),
    ]) as unknown as ListChartsController;

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
      }),
    );

    // `draft` is a resting state: the chart has no rows or no encoding yet.
    // Calling it "Generating…" behind a spinner claimed something was running
    // and left the reader waiting for a chart that was never coming.
    await waitFor(() =>
      expect(screen.getAllByText('Draft — needs data').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText('Generating…')).toBeNull();
  });
});

describe('ChartSidebar CSV upload', () => {
  it('uploads a selected CSV and applies the returned chart', async () => {
    const { subscribeCharts, createChart, deleteChart } = noopControllers();
    const existing = chart('chart-a', 'Sales', { status: 'ready', version: 2 });
    const listCharts = vi.fn(async () => [existing]) as unknown as ListChartsController;
    const uploaded = { ...existing, data: [{ region: 'west', total: 12 }], version: 3 };
    const setChartDataFromCsv = vi
      .fn()
      .mockResolvedValue(uploaded) as unknown as SetChartDataFromCsvController;

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
      }),
    );

    fireEvent.click(await screen.findByText('Sales'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await screen.findByText('Upload CSV');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['region,total\nwest,12'], 'data.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(setChartDataFromCsv).toHaveBeenCalledWith({
        id: 'chart-a',
        expectedVersion: 2,
        file,
      }),
    );
  });

  it('shows the backend rejection message when the upload fails', async () => {
    const { subscribeCharts, createChart, deleteChart } = noopControllers();
    const existing = chart('chart-a', 'Sales', { status: 'ready', version: 2 });
    const listCharts = vi.fn(async () => [existing]) as unknown as ListChartsController;
    const setChartDataFromCsv = vi
      .fn()
      .mockRejectedValue(
        new Error('CSV file has a header but no data rows.'),
      ) as unknown as SetChartDataFromCsvController;

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
      }),
    );

    fireEvent.click(await screen.findByText('Sales'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await screen.findByText('Upload CSV');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['region,total'], 'empty.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText('CSV file has a header but no data rows.')).toBeDefined();
  });
});

describe('ChartSidebar focusChartRequest', () => {
  it('drills straight into the requested chart, even when it is not already selected', async () => {
    const { subscribeCharts, createChart, deleteChart, setChartDataFromCsv } = noopControllers();
    const listCharts = vi.fn(async () => [
      chart('chart-a', 'Revenue by region'),
      chart('chart-b', 'Units by region'),
    ]) as unknown as ListChartsController;

    const { rerender } = renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
        focusChartRequest: null,
      }),
    );

    await screen.findByText('Units by region');
    rerender(
      withMantine(
        createElement(ChartSidebar, {
          listCharts,
          subscribeCharts,
          createChart,
          patchChart: vi.fn() as unknown as PatchChartController,
          deleteChart,
          setChartDataFromCsv,
          focusChartRequest: { chartId: 'chart-b', nonce: 1 },
        }),
      ),
    );

    // Drilled in — the list (and the other chart's row) is gone, and the
    // requested chart's detail view (its Edit button) is showing instead.
    await screen.findByRole('button', { name: 'Edit' });
    expect(screen.queryByText('Revenue by region')).toBeNull();
    expect(screen.getByText('Units by region')).toBeDefined();
  });

  it('re-applies a repeated request for the same chart (bumped nonce), even after returning to the list', async () => {
    const { subscribeCharts, createChart, deleteChart, setChartDataFromCsv } = noopControllers();
    const listCharts = vi.fn(async () => [
      chart('chart-a', 'Revenue by region'),
    ]) as unknown as ListChartsController;

    const { rerender } = renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
        focusChartRequest: { chartId: 'chart-a', nonce: 1 },
      }),
    );
    await screen.findByRole('button', { name: 'Edit' });

    fireEvent.click(screen.getByRole('button', { name: 'Charts' }));
    await screen.findByText('Revenue by region');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();

    rerender(
      withMantine(
        createElement(ChartSidebar, {
          listCharts,
          subscribeCharts,
          createChart,
          patchChart: vi.fn() as unknown as PatchChartController,
          deleteChart,
          setChartDataFromCsv,
          focusChartRequest: { chartId: 'chart-a', nonce: 2 },
        }),
      ),
    );

    await screen.findByRole('button', { name: 'Edit' });
  });
});

describe('ChartSidebar onAttachChart', () => {
  it('shows an attach control per chart and calls onAttachChart with its id and title', async () => {
    const { subscribeCharts, createChart, deleteChart, setChartDataFromCsv } = noopControllers();
    const listCharts = vi.fn(async () => [
      chart('chart-a', 'Revenue by region'),
    ]) as unknown as ListChartsController;
    const onAttachChart = vi.fn();

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
        onAttachChart,
      }),
    );

    const attachButton = await screen.findByRole('button', { name: 'Attach to chat' });
    fireEvent.click(attachButton);

    expect(onAttachChart).toHaveBeenCalledWith({ id: 'chart-a', title: 'Revenue by region' });
  });

  it('hides the attach control entirely when onAttachChart is not given', async () => {
    const { subscribeCharts, createChart, deleteChart, setChartDataFromCsv } = noopControllers();
    const listCharts = vi.fn(async () => [
      chart('chart-a', 'Revenue by region'),
    ]) as unknown as ListChartsController;

    renderUi(
      createElement(ChartSidebar, {
        listCharts,
        subscribeCharts,
        createChart,
        patchChart: vi.fn() as unknown as PatchChartController,
        deleteChart,
        setChartDataFromCsv,
      }),
    );

    await waitFor(() => {
      expect(screen.getAllByText('Revenue by region').length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: 'Attach to chat' })).toBeNull();
  });
});
