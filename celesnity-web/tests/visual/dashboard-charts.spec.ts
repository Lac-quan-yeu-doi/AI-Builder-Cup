import { expect, test, type Page, type Route } from '@playwright/test';

import { mockCoreApi } from './core-api-mock';

const DASHBOARD_ID = '10000000-0000-4000-8000-000000000001';
const TAB_ID = '10000000-0000-4000-8000-000000000002';
const COLLECTION_ID = '10000000-0000-4000-8000-000000000003';

const chartFixtures = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    cardId: '20000000-0000-4000-8000-000000000001',
    title: 'Brand count bar',
    type: 'BAR',
    visualization: {
      schemaVersion: 1,
      type: 'BAR',
      roles: { category: 'name', measures: ['count_rows'] },
      display: { orientation: 'VERTICAL', stacking: 'NONE' },
    },
    columns: [
      { name: 'count_rows', type: 'bigint', family: 'NUMBER' },
      { name: 'name', type: 'varchar', family: 'STRING' },
    ],
    rows: [
      [29, 'Amarin'],
      [35, 'Thiên Thanh'],
      [21, 'Greenbay'],
    ],
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    cardId: '20000000-0000-4000-8000-000000000002',
    title: 'Orders over time',
    type: 'LINE',
    visualization: {
      schemaVersion: 1,
      type: 'LINE',
      roles: { x: 'order_date', measures: ['count_rows'] },
      display: { markers: true },
    },
    columns: [
      { name: 'order_date', type: 'date', family: 'DATE' },
      { name: 'count_rows', type: 'bigint', family: 'NUMBER' },
    ],
    rows: [
      ['2026-09-01', 12],
      ['2026-09-02', 18],
      ['2026-09-03', 15],
    ],
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    cardId: '20000000-0000-4000-8000-000000000003',
    title: 'Revenue area',
    type: 'AREA',
    visualization: {
      schemaVersion: 1,
      type: 'AREA',
      roles: { x: 'order_date', measures: ['revenue'] },
      display: { stacking: 'NONE' },
    },
    columns: [
      { name: 'order_date', type: 'date', family: 'DATE' },
      { name: 'revenue', type: 'double', family: 'NUMBER' },
    ],
    rows: [
      ['2026-09-01', 1200],
      ['2026-09-02', 1800],
      ['2026-09-03', 1500],
    ],
  },
  {
    id: '30000000-0000-4000-8000-000000000004',
    cardId: '20000000-0000-4000-8000-000000000004',
    title: 'Order value scatter',
    type: 'SCATTER',
    visualization: {
      schemaVersion: 1,
      type: 'SCATTER',
      roles: { x: 'average_order_value', y: 'count_rows' },
      display: { pointSize: 80 },
    },
    columns: [
      { name: 'average_order_value', type: 'double', family: 'NUMBER' },
      { name: 'count_rows', type: 'bigint', family: 'NUMBER' },
    ],
    rows: [
      [125, 12],
      [220, 18],
      [310, 15],
    ],
  },
  {
    id: '30000000-0000-4000-8000-000000000005',
    cardId: '20000000-0000-4000-8000-000000000005',
    title: 'Brand share pie',
    type: 'PIE',
    visualization: {
      schemaVersion: 1,
      type: 'PIE',
      roles: { measure: 'count_rows', breakout: 'name' },
      display: { variant: 'PIE', showLegend: true },
    },
    columns: [
      { name: 'count_rows', type: 'bigint', family: 'NUMBER' },
      { name: 'name', type: 'varchar', family: 'STRING' },
    ],
    rows: [
      [29, 'Amarin'],
      [35, 'Thiên Thanh'],
      [21, 'Greenbay'],
    ],
  },
  {
    id: '30000000-0000-4000-8000-000000000006',
    cardId: '20000000-0000-4000-8000-000000000006',
    title: 'Total orders number',
    type: 'NUMBER',
    visualization: {
      schemaVersion: 1,
      type: 'NUMBER',
      roles: { measure: 'count_rows' },
      display: {},
    },
    columns: [{ name: 'count_rows', type: 'bigint', family: 'NUMBER' }],
    rows: [[91]],
  },
  {
    id: '30000000-0000-4000-8000-000000000007',
    cardId: '20000000-0000-4000-8000-000000000007',
    title: 'Brand count table',
    type: 'TABLE',
    visualization: {
      schemaVersion: 1,
      type: 'TABLE',
      roles: { columns: ['name', 'count_rows'] },
      display: {},
    },
    columns: [
      { name: 'count_rows', type: 'bigint', family: 'NUMBER' },
      { name: 'name', type: 'varchar', family: 'STRING' },
    ],
    rows: [
      [29, 'Amarin'],
      [35, 'Thiên Thanh'],
      [21, 'Greenbay'],
    ],
  },
] as const;

test('saved dashboard renders every chart type at the card width', async ({ page }) => {
  await mockCoreApi(page);
  await mockDashboardChartGallery(page);
  await page.goto(`/analytics/dashboards/${DASHBOARD_ID}`);

  await expect(page.getByRole('heading', { name: 'Visualization gallery' })).toBeVisible();

  for (const fixture of chartFixtures.filter(({ type }) =>
    ['BAR', 'LINE', 'AREA', 'SCATTER', 'PIE'].includes(type),
  )) {
    const card = chartCard(page, fixture.title);
    const preview = card.getByRole('img', { name: `${fixture.type} chart preview` });
    await expect(preview).toBeVisible();
    // Recharts draws the plot as one SVG and each legend swatch as its own —
    // and every one of them carries `recharts-surface`. Only the plot is a
    // direct child of the wrapper, which is what makes this the chart itself.
    const graphic = preview.locator('.recharts-wrapper > svg');
    await expect(graphic).toBeVisible();

    const cardBox = await card.boundingBox();
    const previewBox = await preview.boundingBox();
    const graphicBox = await graphic.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    expect(graphicBox).not.toBeNull();
    expect(previewBox?.width ?? 0).toBeGreaterThan((cardBox?.width ?? 0) * 0.85);
    expect(graphicBox?.width ?? 0).toBeGreaterThan((cardBox?.width ?? 0) * 0.75);
  }

  await expect(
    chartCard(page, 'Total orders number').getByText('91', { exact: true }),
  ).toBeVisible();
  const table = chartCard(page, 'Brand count table').getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'name' })).toBeVisible();
  await expect(table.getByText('Thiên Thanh', { exact: true })).toBeVisible();
});

test('dashboard editor renders every saved chart type at the card width', async ({ page }) => {
  await mockCoreApi(page);
  await mockDashboardChartGallery(page);
  await page.goto(`/analytics/dashboards/${DASHBOARD_ID}/edit`);

  await expect(page.getByRole('main', { name: 'Dashboard editor' })).toBeVisible();

  for (const fixture of chartFixtures.filter(({ type }) =>
    ['BAR', 'LINE', 'AREA', 'SCATTER', 'PIE'].includes(type),
  )) {
    const card = chartCard(page, fixture.title);
    const preview = card.getByRole('img', { name: `${fixture.type} chart preview` });
    await expect(preview).toBeVisible();
    // Recharts draws the plot as one SVG and each legend swatch as its own —
    // and every one of them carries `recharts-surface`. Only the plot is a
    // direct child of the wrapper, which is what makes this the chart itself.
    const graphic = preview.locator('.recharts-wrapper > svg');
    await expect(graphic).toBeVisible();

    const cardBox = await card.boundingBox();
    const previewBox = await preview.boundingBox();
    const graphicBox = await graphic.boundingBox();
    expect(previewBox?.width ?? 0).toBeGreaterThan((cardBox?.width ?? 0) * 0.85);
    expect(graphicBox?.width ?? 0).toBeGreaterThan((cardBox?.width ?? 0) * 0.75);
  }

  await expect(
    chartCard(page, 'Total orders number').getByText('91', { exact: true }),
  ).toBeVisible();
  await expect(chartCard(page, 'Brand count table').getByRole('table')).toBeVisible();
});

function chartCard(page: Page, title: string) {
  return page
    .getByRole('heading', { name: title, exact: true })
    .locator('xpath=ancestor::article[1]');
}

async function mockDashboardChartGallery(page: Page): Promise<void> {
  await page.route('**/api/core/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/core/u, '');
    const method = route.request().method();
    if (method === 'GET' && path === `/dashboards/${DASHBOARD_ID}`) {
      await fulfillJson(route, dashboardFixture());
      return;
    }
    if (method === 'POST' && path === `/dashboards/${DASHBOARD_ID}/execute`) {
      await fulfillJson(route, dashboardExecutionFixture());
      return;
    }
    if (
      (method === 'GET' && path === `/dashboards/${DASHBOARD_ID}/filter-targets`) ||
      (method === 'POST' && path === `/dashboards/${DASHBOARD_ID}/filter-targets/preview`)
    ) {
      await fulfillJson(route, { cards: [] });
      return;
    }
    if (method === 'GET' && path === '/chart-authoring/charts') {
      await fulfillJson(route, chartFixtures.map(chartDto));
      return;
    }
    const chart = chartFixtures.find(
      ({ id }) => method === 'GET' && path === `/chart-authoring/charts/${id}`,
    );
    if (chart) {
      await fulfillJson(route, chartDto(chart));
      return;
    }
    const executedChart = chartFixtures.find(
      ({ id }) => method === 'POST' && path === `/chart-authoring/charts/${id}/runs`,
    );
    if (executedChart) {
      await fulfillJson(route, chartPreviewDto(executedChart));
      return;
    }
    await route.fallback();
  });
}

function dashboardFixture() {
  return {
    id: DASHBOARD_ID,
    organization_id: '10000000-0000-4000-8000-000000000004',
    collection_id: COLLECTION_ID,
    name: 'Visualization gallery',
    description: 'Responsive dashboard chart regression fixture',
    expected_revision: 1,
    tabs: [{ id: TAB_ID, name: 'Tab 1', order: 0 }],
    cards: chartFixtures.map((chart, index) => ({
      id: chart.cardId,
      tab_id: TAB_ID,
      kind: 'CHART',
      chart_id: chart.id,
      chart_revision_number: 1,
      visualization_overrides: {},
      geometry: {
        x: index % 2 === 0 ? 0 : 12,
        y: Math.floor(index / 2) * 9,
        width: 12,
        height: 9,
      },
    })),
    filters: [],
    mappings: [],
    created_by_identity_id: '10000000-0000-4000-8000-000000000005',
    archived_at: null,
    created_at: '2026-09-07T00:00:00.000Z',
    updated_at: '2026-09-07T00:00:00.000Z',
  };
}

function dashboardExecutionFixture() {
  return {
    dashboard_id: DASHBOARD_ID,
    tab_id: TAB_ID,
    cards: chartFixtures.map((chart) => ({
      card_id: chart.cardId,
      state: 'SUCCESS',
      result: {
        runId: `run-${chart.type.toLowerCase()}`,
        columns: chart.columns,
        rows: chart.rows,
        rowCount: chart.rows.length,
      },
    })),
  };
}

function chartDto(chart: (typeof chartFixtures)[number]) {
  return {
    id: chart.id,
    title: chart.title,
    description: null,
    organization_id: '10000000-0000-4000-8000-000000000004',
    collection_id: COLLECTION_ID,
    owner_identity_id: '10000000-0000-4000-8000-000000000005',
    provenance: 'MANUAL',
    current_revision_number: 1,
    query_definition: {
      schemaVersion: 1,
      mode: 'NATIVE',
      context: { catalog: 'iceberg', schema: 'analytics' },
      parameters: [],
      sql: 'SELECT deterministic_dashboard_fixture',
    },
    visualization_definition: chart.visualization,
    output_schema: chart.columns,
    created_at: '2026-09-07T00:00:00.000Z',
    updated_at: '2026-09-07T00:00:00.000Z',
  };
}

function chartPreviewDto(chart: (typeof chartFixtures)[number]) {
  return {
    run_id: `run-${chart.type.toLowerCase()}`,
    columns: chart.columns,
    rows: chart.rows,
    row_count: chart.rows.length,
    byte_count: 128,
    truncated: false,
  };
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}
