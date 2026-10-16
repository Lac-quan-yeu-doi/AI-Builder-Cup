/**
 * Paired before/after captures of the analytics redesign.
 *
 * Runs the same scripted journey against two servers — the base commit and the
 * redesign — with the Core API stubbed from the visual-suite fixtures, so both
 * sides see byte-identical data and any difference on screen is a design
 * decision rather than a difference in the data.
 *
 *   node scripts/capture-redesign.mjs
 *
 * Expects a `before` server on 3011, an `after` server on 3012 and the
 * workspace-access stub on 3101 (see docs/analytics-redesign-plan.md).
 */
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

import * as fixtures from '../tests/visual/fixtures.ts';

const OUT = path.resolve('docs/redesign-shots');
const SIDES = [
  { id: 'before', port: '3011', origin: 'http://127.0.0.1:3011' },
  { id: 'after', port: '3012', origin: 'http://127.0.0.1:3012' },
];

/**
 * A chart list with descriptions and chat provenance — the shape the live
 * workspace actually returns, and the shape the old browse list threw away.
 * Both sides are served exactly this.
 */
/**
 * A workspace at real scale.
 *
 * The fixtures ship one collection and one chart, and a library design judged
 * against one collection is not judged at all — a rail with a single entry and
 * a list with three rows hides every question worth asking about hierarchy,
 * ranking and density.
 */
const ORG = 'visual-test-organization';
const collection = (id, name, parentId, type = 'COLLECTION') => ({
  id,
  organization_id: ORG,
  parent_id: parentId,
  name,
  description: null,
  type,
  access: 'CURATE',
  chart_count: 0,
  archived_at: null,
  children: [],
});

const SHARED = 'c-shared';
const PERSONAL = 'c-personal';
const collections = [
  collection(SHARED, 'Shared', null, 'ROOT'),
  collection('c-finance', 'Finance', SHARED),
  collection('c-ops', 'Operations', SHARED),
  collection('c-quality', 'Quality', SHARED),
  collection('c-supply', 'Supply chain', SHARED),
  collection('c-exec', 'Executive', SHARED),
  collection(PERSONAL, 'Personal', null, 'PERSONAL'),
  collection('c-drafts', 'Drafts', PERSONAL),
];

const CHART_SEED = [
  ['c-finance', 'Revenue by region', 'Monthly revenue split by sales region', 'MANUAL'],
  ['c-finance', 'Gross margin trend', 'Margin by month, twelve-month window', 'MANUAL'],
  ['c-finance', 'Cost per unit — 2026', 'Unit cost by production line', 'CHAT'],
  ['c-finance', 'Invoice ageing', 'Outstanding invoices bucketed by age', 'MANUAL'],
  [
    'c-ops',
    'Max temperature by machine — 2026-09-02',
    'Bar chart of max temperature by machine from factory_silver.press_telemetry',
    'CHAT',
  ],
  [
    'c-ops',
    'Avg temperature by machine — 2026-09-02',
    'Chart average temperature by machine as a bar chart',
    'CHAT',
  ],
  [
    'c-ops',
    'Daily temperature summary (all days)',
    'Show data of all machines on all days',
    'CHAT',
  ],
  ['c-ops', 'Cycle count by line', 'Completed cycles per production line per shift', 'MANUAL'],
  ['c-ops', 'Downtime minutes by cause', 'Unplanned downtime grouped by reason code', 'MANUAL'],
  ['c-ops', 'Vibration outliers', 'Readings beyond two standard deviations', 'CHAT'],
  ['c-quality', 'Defect rate by shift', 'Defects per thousand units, by shift', 'MANUAL'],
  ['c-quality', 'First-pass yield', 'Share of units passing without rework', 'MANUAL'],
  ['c-quality', 'Scrap weight by week', 'Scrapped material in kilograms', 'CHAT'],
  ['c-supply', 'Supplier lead time', 'Days from order to receipt, by supplier', 'MANUAL'],
  ['c-supply', 'Stock cover by SKU', 'Days of cover at current consumption', 'MANUAL'],
  ['c-supply', 'Late deliveries', 'Receipts past their promised date', 'CHAT'],
  ['c-exec', 'Plant scorecard', 'Headline metrics for the weekly review', 'MANUAL'],
  ['c-exec', 'Output vs plan', 'Actual against planned output by plant', 'MANUAL'],
  ['c-drafts', 'Untitled exploration', null, 'MANUAL'],
  ['c-drafts', 'Temperature spike check', 'Scratch query while investigating line A', 'CHAT'],
  ['c-personal', 'My weekly numbers', 'The four figures I check on Monday', 'MANUAL'],
  ['c-personal', 'Press line A deep dive', 'Everything about line A in one place', 'CHAT'],
];

const day = (n) => new Date(Date.UTC(2026, 8, 15 - n, 9, 0, 0)).toISOString();

const charts = CHART_SEED.map(([collectionId, title, description, provenance], index) => ({
  ...fixtures.chartCreated,
  id: `chart-${index === 0 ? 'manual-1' : `s${index}`}`,
  collection_id: collectionId,
  title,
  description,
  provenance,
  updated_at: day(index),
  created_at: day(index + 10),
}));

const DASHBOARD_SEED = [
  ['c-ops', 'Shift operations', 'Production performance and quality overview.'],
  ['c-exec', 'Plant overview', 'The view the weekly review runs from.'],
  ['c-quality', 'Quality daily', 'Defects, yield and scrap since midnight.'],
  ['c-finance', 'Finance monthly', 'Revenue, margin and ageing for the month.'],
  ['c-supply', 'Supplier health', 'Lead time and late deliveries by supplier.'],
];

const dashboards = DASHBOARD_SEED.map(([collectionId, name, description], index) => ({
  ...fixtures.plantDashboardSummary,
  id: index === 0 ? fixtures.plantDashboardId : `dashboard-s${index}`,
  collection_id: collectionId,
  name,
  description,
  updated_at: day(index * 2 + 1),
}));

async function stubCore(page, side) {
  const session = await page.request.post(`${side.origin}/api/auth/local-session`, {
    data: { persona: 'local-owner' },
    headers: { origin: side.origin },
  });
  if (session.status() !== 204) throw new Error(`session: HTTP ${session.status()}`);

  await page.route('**/api/agent/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  await page.route('**/api/core/**', (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^.*\/api\/core/u, '');
    const method = route.request().method();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (p === '/chart-collections') return json(collections);
    if (p === '/chart-authoring/charts') {
      return method === 'POST' ? json(charts[0]) : json(charts);
    }
    if (p === '/chart-authoring/charts/chart-manual-1') {
      return json({
        ...charts[0],
        visualization_definition: {
          schemaVersion: 1,
          type: 'BAR',
          roles: { category: 'order_date', measures: ['order_count'] },
          display: {},
        },
      });
    }
    if (p === '/chart-authoring/charts/chart-manual-1/revisions') {
      return json([
        {
          chart_id: 'chart-manual-1',
          revision_number: 1,
          title: charts[0].title,
          query_definition: charts[0].query_definition,
          visualization_definition: charts[0].visualization_definition,
          output_schema: charts[0].output_schema,
          created_at: '2026-09-15T10:49:30.678Z',
          restored_from_revision_number: null,
        },
      ]);
    }
    if (/^\/chart-authoring\/charts\/[^/]+\/runs$/u.test(p)) return json(fixtures.chartPreview);
    if (p === '/chart-authoring/previews' || p === '/chart-authoring/query-previews') {
      return json(fixtures.chartPreview);
    }
    if (p === '/chart-authoring/query-compilations') return json(fixtures.chartQueryCompilation);

    if (p === `/dashboards/${fixtures.plantDashboardId}`)
      return json({ ...fixtures.plantDashboard, collection_id: 'c-ops' });
    if (p === '/dashboards') return json(dashboards);
    // Cards resolve rather than sitting on "Loading chart…" forever: the
    // runtime keeps a card pending until execute names it.
    if (p === `/dashboards/${fixtures.plantDashboardId}/execute`) {
      return json({
        dashboard_id: fixtures.plantDashboardId,
        tab_id: 'dashboard-tab-1',
        cards: ['dashboard-card-1', 'dashboard-card-2'].map((cardId) => ({
          card_id: cardId,
          state: 'SUCCESS',
          result: {
            runId: `${cardId}-run`,
            columns: fixtures.chartPreview.columns,
            rows: fixtures.chartPreview.rows,
            rowCount: fixtures.chartPreview.row_count,
          },
        })),
      });
    }
    // The editor asks which card fields a filter could target; the runtime maps
    // `dto.cards`, so an empty array is not the same as an empty envelope.
    if (/\/filter-targets(?:\/preview)?$/u.test(p)) return json({ cards: [] });

    if (p === '/catalogs') return json(fixtures.catalogs);
    if (/^\/catalogs\/[^/]+\/schemas$/u.test(p)) return json(fixtures.namespaces);
    if (/^\/catalogs\/[^/]+\/schemas\/[^/]+\/tables$/u.test(p)) return json(fixtures.tables);
    if (/\/tables\/[^/]+\/columns$/u.test(p)) return json(fixtures.tableMetadata);
    if (/\/tables\/[^/]+\/preview$/u.test(p)) return json(fixtures.tablePreview);
    if (p === '/administration/me') return json(fixtures.administrationSession);
    return json([]);
  });
}

const pickCatalog = async (page) => {
  await page.getByRole('button', { name: 'iceberg', exact: true }).first().click();
  await page.getByRole('button', { name: 'analytics', exact: true }).first().click();
  await page
    .getByRole('button', { name: /^orders(?:\s|$)/u })
    .first()
    .click();
};

/**
 * Each state names a route and, where the state is only reachable by acting,
 * the actions that reach it. `settle` is text that proves the page is done.
 */
const STATES = [
  {
    id: '01-browse',
    title: 'Browse — a collection of saved questions',
    note: 'Three charts generated from the same table on the same day. The list is the first thing anyone sees.',
    path: '/analytics',
    settleRole: { role: 'button', name: /New/ },
  },
  {
    id: '01b-browse-recents',
    title: 'Browse — a browser that has been here before',
    note: 'The same library once this browser has opened a few things.',
    path: '/analytics',
    settleRole: { role: 'button', name: /New/ },
    seedRecents: true,
  },
  {
    id: '01c-browse-scoped',
    title: 'Browse — narrowed to one collection',
    note: 'Choosing a collection filters the list; it does not become a different page.',
    path: '/analytics/collections/c-ops',
    settle: 'Cycle count by line',
  },
  {
    id: '02-builder-entry',
    title: 'Ask — choosing how to start',
    note: 'The first screen of a new chart.',
    path: '/analytics/charts/new',
    settle: 'New question',
  },
  {
    id: '03-builder-data',
    title: 'Ask — picking the starting table',
    note: 'The data picker, before anything is chosen.',
    path: '/analytics/charts/new?entry=question',
    settle: 'iceberg',
  },
  {
    id: '04-builder-browse-dialog',
    title: 'Ask — browsing the whole catalog',
    note: 'Browsing the catalog.',
    path: '/analytics/charts/new?entry=question',
    settle: 'iceberg',
    async act(page) {
      // The old build hides the three columns behind a dialog; the new one has
      // them on the page. Open the dialog only where it exists.
      const browseAll = page.getByRole('button', { name: 'Browse all data' });
      if ((await browseAll.count()) > 0) {
        await browseAll.click();
        await page.getByRole('dialog').waitFor();
      } else {
        await page.getByRole('button', { name: 'iceberg', exact: true }).first().click();
        await page.getByRole('button', { name: 'analytics', exact: true }).first().click();
      }
      await page.waitForTimeout(600);
    },
  },
  {
    id: '05-builder-notebook',
    title: 'Ask — the query notebook',
    note: 'A source is chosen; the steps are open for filtering and summarising.',
    path: '/analytics/charts/new?entry=question',
    settle: 'iceberg',
    act: pickCatalog,
  },
  {
    id: '05b-builder-start-recents',
    title: 'Ask — a browser that has queried before',
    note: 'Recent tables, for the common case of asking another question of one you already use.',
    path: '/analytics/charts/new?entry=question',
    settle: 'iceberg',
    seedRecents: true,
  },
  {
    id: '06-builder-results',
    title: 'See — the result of the query',
    note: 'After Visualize: the rows, and the controls that decide how they are drawn.',
    path: '/analytics/charts/new?entry=question',
    settle: 'iceberg',
    async act(page) {
      await pickCatalog(page);
      await page.getByRole('button', { name: 'Visualize', exact: true }).click();
      await page.waitForTimeout(1200);
    },
  },
  {
    id: '07-saved-chart',
    title: 'Read — a saved chart',
    note: 'Opening a chart someone else saved.',
    path: '/analytics/charts/chart-manual-1',
    settle: 'Revenue by region',
  },
  {
    id: '08-dashboard',
    title: 'Assemble — a dashboard',
    note: 'A dashboard with cards, tabs and a filter.',
    path: `/analytics/dashboards/${fixtures.plantDashboardId}`,
    settle: 'Shift operations',
  },
  {
    id: '09-dashboard-editor',
    title: 'Assemble — editing a dashboard',
    note: 'Edit mode, and the toolbar that adds things to it.',
    path: `/analytics/dashboards/${fixtures.plantDashboardId}/edit`,
    settleRole: { role: 'button', name: 'Save' },
  },
  {
    id: '10-browse-mobile',
    title: 'Browse at 390px',
    note: 'The same collection on a phone.',
    path: '/analytics',
    settleRole: { role: 'button', name: /New/ },
    width: 390,
  },
  {
    id: '11-builder-notebook-mobile',
    title: 'The notebook at 390px',
    note: 'The query steps on a phone.',
    path: '/analytics/charts/new?entry=question',
    settle: 'iceberg',
    width: 390,
    act: pickCatalog,
  },
];

async function capture(side, state) {
  // A fresh browser per capture: full-page shots of a long dashboard accumulate
  // enough memory across contexts to take the whole run down with them.
  const browser = await chromium.launch();
  const width = state.width ?? 1440;
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  if (state.seedRecents) {
    await page.addInitScript(
      ([key, value]) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // A browser with site data blocked simply shows no recents.
        }
      },
      [
        'celesnity.analytics.recents',
        JSON.stringify({
          state: {
            objects: [
              { id: 'dashboard-s1', kind: 'DASHBOARD', at: Date.now() },
              { id: 'chart-s4', kind: 'CHART', at: Date.now() - 1000 },
              { id: 'chart-manual-1', kind: 'CHART', at: Date.now() - 2000 },
              { id: 'dashboard-s2', kind: 'DASHBOARD', at: Date.now() - 3000 },
            ],
            tables: [
              { catalog: 'iceberg', schema: 'analytics', table: 'orders', at: Date.now() },
              {
                catalog: 'iceberg',
                schema: 'analytics',
                table: 'daily_orders',
                at: Date.now() - 1,
              },
            ],
          },
          version: 0,
        }),
      ],
    );
  }
  const file = path.join(OUT, `${state.id}-${side.id}.png`);
  try {
    await stubCore(page, side);
    await page.goto(`${side.origin}${state.path}`, { waitUntil: 'domcontentloaded' });
    if (state.settle) {
      await page.getByText(state.settle, { exact: false }).first().waitFor({ timeout: 25_000 });
    }
    if (state.settleRole) {
      await page
        .getByRole(state.settleRole.role, { name: state.settleRole.name })
        .first()
        .waitFor({ timeout: 25_000 });
    }
    await page.waitForTimeout(1200);
    if (state.act) await state.act(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    console.log(`  ${side.id.padEnd(6)} ok`);
    return true;
  } catch (error) {
    // A state the old build simply cannot reach is itself a finding; record the
    // page as it stands rather than aborting the whole run.
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }).catch(() => {});
    console.log(`  ${side.id.padEnd(6)} partial — ${String(error).split('\n')[0]}`);
    return false;
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * The workspace-policy stub both servers boot against, run in-process so its
 * lifetime is exactly the run's. Started separately it kept outliving or
 * predeceasing the capture, and every page then rendered access-denied.
 */
const stub = createServer((request, response) => {
  if (request.url === '/health') return void response.writeHead(200).end('ok');
  if (request.url === '/api/v1/administration/me') {
    response.writeHead(200, { 'content-type': 'application/json' });
    return void response.end(JSON.stringify({ visibleFeatures: null }));
  }
  response.writeHead(404).end('not found');
});
await new Promise((resolve, reject) => {
  stub.once('error', reject);
  stub.listen(3101, '127.0.0.1', resolve);
});

await mkdir(OUT, { recursive: true });
const results = [];
for (const state of STATES) {
  console.log(state.id);
  const ok = {};
  for (const side of SIDES) ok[side.id] = await capture(side, state);
  results.push({ ...state, ok, act: undefined });
}
stub.close();
await writeFile(path.join(OUT, 'states.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length} states captured into ${OUT}`);
