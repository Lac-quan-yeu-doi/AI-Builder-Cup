import { expect, test, type Locator, type Page } from '@playwright/test';

import { mockCoreApi } from './core-api-mock';

/**
 * Visual baseline for every current workspace route, in its list state and
 * (where the screen has one) its detail state.
 */
const screens = [
  {
    name: 'data-connections',
    path: '/connections',
    settled: 'analytics-primary',
  },
  { name: 'pipeline-jobs', path: '/pipelines', settled: 'Daily order load' },
  { name: 'executions', path: '/executions', settled: 'Run executions' },
  {
    name: 'data-source-crawler',
    path: '/metadata-crawler',
    settled: 'Data Source Crawler',
  },
  {
    name: 'database-overview',
    path: '/databases/analytics',
    settled: 'Recent activity',
  },
  {
    name: 'database-pipelines',
    path: '/databases/analytics?tab=pipelines',
    settled: 'Daily order load',
  },
  { name: 'catalog', path: '/catalog/databases', settled: 'Databases (2)' },
  { name: 'catalog-tables', path: '/catalog/tables', settled: 'orders' },
  { name: 'sql', path: '/sql', settled: 'History' },
  { name: 'skills', path: '/skills', settled: 'Project skills' },
  { name: 'streaming', path: '/streaming', settled: 'Line A sensors' },
  { name: 'devices', path: '/devices', settled: 'Total devices' },
] as const;

test('plant model canvas and schema-driven inspector', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/plant-model/b0000000-0000-4000-8000-000000000001/model');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  const plantNode = page.locator('.react-flow__node[data-id="node-cut"]');
  await expect(plantNode.getByText('Code', { exact: true })).toBeVisible();
  await expect(plantNode.getByText('CUT_1', { exact: true })).toBeVisible();
  await expect(plantNode.getByText('Primary equipment', { exact: true })).toBeVisible();
  await expect(plantNode.getByText('Sewing 1', { exact: true })).toBeVisible();
  await plantNode.hover();
  const details = page.locator('[data-slot="hover-card-content"]');
  await expect(details.getByText('Allowed statuses', { exact: true })).toBeVisible();
  await expect(details.getByText('running, maintenance', { exact: true })).toBeVisible();
  await plantNode.click();
  await expect(page.getByText('Inspector', { exact: true })).toBeVisible();
  await expect(page.getByText('Card overview fields', { exact: true })).toBeVisible();
  const codeOverviewToggle = page.getByRole('checkbox', { name: /Code\s+CUT_1/ });
  await expect(codeOverviewToggle).toBeChecked();
  await codeOverviewToggle.uncheck();
  await expect(plantNode.getByText('CUT_1', { exact: true })).toBeHidden();
  await codeOverviewToggle.check();
  await expect(plantNode.getByText('CUT_1', { exact: true })).toBeVisible();
  await expect(page.locator('aside input').nth(1)).toHaveValue('CUT_1');
  const statuses = page.getByRole('combobox', { name: 'Allowed statuses' });
  await expect(statuses).toContainText('Running');
  await expect(statuses).toContainText('Maintenance');
  await statuses.click();
  await page.getByText('Stopped', { exact: true }).click();
  await expect(statuses).toContainText('Stopped');
  await expect(page).toHaveScreenshot('plant-model-canvas.png', { fullPage: true });
});

test('plant model catalog property setup explains lookup behavior', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/plant-model/b0000000-0000-4000-8000-000000000001/model');
  await page.getByRole('button', { name: 'Node types' }).click();
  await expect(page.getByRole('checkbox', { name: 'Show on node card' }).first()).toBeChecked();
  await expect(page.getByLabel('Catalog', { exact: true })).toHaveValue('iceberg');
  await expect(page.getByLabel('Schema', { exact: true })).toHaveValue('demo');
  await expect(page.getByLabel('Table', { exact: true })).toHaveValue('plant_statuses');
  await expect(page.getByLabel('Value column', { exact: true })).toHaveValue('status');
  await expect(page.getByLabel('Label column (optional)', { exact: true })).toHaveValue('label');
  await expect(
    page.getByText(
      'Loads options from the catalog and lets the user save multiple selected values on the node.',
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Maximum options')).toHaveValue('100');
  await expect(page).toHaveScreenshot('plant-model-catalog-binding.png', { fullPage: true });
});

test('plant workspace exposes contextual chat and a multi-chart production overview', async ({
  page,
}) => {
  await mockCoreApi(page);
  await page.goto('/plant-model/b0000000-0000-4000-8000-000000000001/model');
  await page.locator('.react-flow__node[data-id="node-cut"]').click();

  await page.getByRole('button', { name: 'Ask Minder' }).click();
  await expect(page.getByText('Plant Model assistant', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Focused on Cutting 1; Minder retrieves details when needed'),
  ).toBeVisible();
  const emptyState = page.getByText('Ask about this plant model', { exact: true });
  const composer = page.getByPlaceholder(/Ask about nodes/);
  await expect(emptyState).toBeVisible();
  await expect(composer).toBeVisible();
  const chatPanel = page.getByRole('complementary', { name: 'Plant Model assistant' });
  const panelBox = await chatPanel.boundingBox();
  const emptyStateBox = await emptyState.boundingBox();
  const viewportHeight = page.viewportSize()?.height ?? 0;
  // A column beside the workspace, not an overlay over it: it starts under the
  // site header and ends exactly at the fold. It used to be `fixed inset-0`,
  // and when it became a column the shell had no definite height to give it —
  // the panel grew past the viewport and took its composer with it.
  expect(panelBox?.width).toBe(400);
  expect(panelBox?.y ?? 0).toBeGreaterThan(0);
  expect(Math.round((panelBox?.y ?? 0) + (panelBox?.height ?? 0))).toBe(viewportHeight);
  expect(emptyStateBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan((panelBox?.y ?? 0) + 180);

  // The composer is the control this panel exists for, so it has to be on
  // screen without scrolling the page.
  const composerBox = await composer.boundingBox();
  expect(Math.round((composerBox?.y ?? 0) + (composerBox?.height ?? 0))).toBeLessThanOrEqual(
    viewportHeight,
  );

  await page.getByRole('button', { name: 'Close the assistant' }).click();
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByRole('heading', { name: 'Production overview' })).toBeVisible();
  await expect(page.getByText('Associated dashboards').locator('..').getByText('1')).toBeVisible();
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await expect(page.getByLabel('Focus upstream nodes')).toBeDisabled();

  await page.getByLabel('Search plant nodes').fill('Sewing');
  await page.getByRole('option', { name: /Sewing 1/u }).click();
  await expect(page.getByLabel('Focus downstream nodes')).toBeEnabled();
  await page.getByLabel('Focus downstream nodes').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByLabel('Reset topology view').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  const cuttingOverviewNode = page.locator('.react-flow__node[data-id="node-cut"]');
  await expect(cuttingOverviewNode.getByText('Code', { exact: true })).toBeVisible();
  await expect(cuttingOverviewNode.getByText('CUT_1', { exact: true })).toBeVisible();
  await expect(cuttingOverviewNode.getByText('Primary equipment', { exact: true })).toBeVisible();
  await expect(cuttingOverviewNode.getByText('Sewing 1', { exact: true })).toBeVisible();

  const topology = page.getByLabel('Plant production topology');
  const topologyBox = await topology.boundingBox();
  expect(topologyBox).not.toBeNull();
  const viewport = topology.locator('.react-flow__viewport');
  const transformBeforePan = await viewport.getAttribute('style');
  if (topologyBox) {
    await page.mouse.move(topologyBox.x + 80, topologyBox.y + topologyBox.height - 100);
    await page.mouse.down();
    await page.mouse.move(topologyBox.x + 160, topologyBox.y + topologyBox.height - 60, {
      steps: 4,
    });
    await page.mouse.up();
  }
  await expect(viewport).not.toHaveAttribute('style', transformBeforePan ?? '');
  await topology.locator('.react-flow__controls-fitview').click();
  await expect(page.getByRole('heading', { name: 'Untitled chart' })).toHaveCount(2);
  await expect(page).toHaveScreenshot('plant-model-overview.png', { fullPage: true });

  await page.getByRole('button', { name: 'Ask Minder' }).click();
  const chatBeforeScroll = await chatPanel.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByPlaceholder(/Ask about nodes/)).toBeVisible();
  const chatAfterScroll = await chatPanel.boundingBox();
  // The shell owns a definite height, so the page has nothing to scroll and the
  // panel cannot slide out of the fold with it. The panel used to be pinned to
  // the viewport instead, which is what hid this.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(chatAfterScroll?.y).toBeCloseTo(chatBeforeScroll?.y ?? 0, 0);
  expect((chatAfterScroll?.y ?? 0) + (chatAfterScroll?.height ?? 0)).toBeLessThanOrEqual(
    (page.viewportSize()?.height ?? 0) + 1,
  );
  await page.getByRole('button', { name: 'Close the assistant' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.getByRole('link', { name: 'Dashboards', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plant dashboards' })).toBeVisible();
  await expect(page.getByText('Shift operations', { exact: true })).toBeVisible();
  await expect(page.getByText('Default', { exact: true })).toBeVisible();
});

test('plant model assistant keeps its empty state and composer visible on narrow screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 640 });
  await mockCoreApi(page);
  await page.goto('/plant-model/b0000000-0000-4000-8000-000000000001/overview');
  await page.getByRole('button', { name: 'Ask Minder' }).click();

  const panel = page.getByRole('complementary', { name: 'Plant Model assistant' });
  const emptyState = page.getByText('Ask about this plant model', { exact: true });
  const composer = page.getByPlaceholder(/Ask about nodes/);
  await expect(panel).toBeVisible();
  await expect(emptyState).toBeVisible();
  await expect(composer).toBeVisible();

  const panelBox = await panel.boundingBox();
  const emptyStateBox = await emptyState.boundingBox();
  const composerBox = await composer.boundingBox();
  expect(panelBox?.x).toBe(0);
  expect(panelBox?.width).toBe(720);
  expect(emptyStateBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(180);
  expect((composerBox?.y ?? 0) + (composerBox?.height ?? 0)).toBeLessThanOrEqual(640);
});

test('plant workspace protects unsaved model changes while switching views', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/plant-model/b0000000-0000-4000-8000-000000000001/model');
  await page.locator('.react-flow__node[data-id="node-cut"]').click();
  await page.locator('aside input').first().fill('Unsaved cutting station');

  page.once('dialog', async (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/\/model$/u);

  page.once('dialog', async (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/\/overview$/u);
});

test('workspace feature denial filters navigation before rendering the destination', async ({
  page,
}) => {
  await mockCoreApi(page);
  await page.route('**/api/core/administration/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ visibleFeatures: ['HOME'] }),
    }),
  );
  await page.goto('/chat');
  await page.getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Feature not available' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toHaveCount(0);
  await expect(page).toHaveScreenshot('workspace-access-denied.png', { fullPage: true });
});

test('workspace with no assigned features retains account controls', async ({ page }) => {
  await mockCoreApi(page);
  await page.route('**/api/core/administration/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ visibleFeatures: [] }),
    }),
  );
  await page.goto('/chat');
  // Any destination will do — the policy grants none. `Databases` replaces the
  // `Devices` link this used to click, which is now reached inside the streaming
  // adapter that owns it rather than from the rail.
  await page.getByRole('link', { name: 'Databases', exact: true }).click();
  await expect(
    page.getByText('No workspace features are assigned to your access groups.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await expect(page).toHaveScreenshot('workspace-no-features.png', { fullPage: true });
});

/*
 * Monaco is masked because its own chrome is not ours to assert on. The region
 * wrappers are listed alongside the editor itself: `.monaco-editor` only exists
 * once Monaco has mounted, so on a slow capture the unmasked "Loading…"
 * placeholder used to land in the baseline.
 */
const editors = [
  { locator: '.monaco-editor' },
  { locator: '[data-monaco-editor]' },
  { locator: '[role="region"][aria-label="SQL editor"]' },
  { locator: '[role="region"][aria-label="Python source editor"]' },
] as const;

async function settle(page: Page, text: string): Promise<void> {
  await page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

function masks(page: Page) {
  return editors.map((editor) => page.locator(editor.locator));
}

for (const screen of screens) {
  test(`${screen.name} page matches the visual baseline`, async ({ page }) => {
    await mockCoreApi(page);
    await page.goto(screen.path);
    await settle(page, screen.settled);

    await expect(page).toHaveScreenshot(`${screen.name}-desktop.png`, {
      fullPage: true,
      mask: masks(page),
    });
  });
}

test('device firmware management section matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/devices');
  await page.getByRole('tab', { name: 'Firmware & OTA', exact: true }).click();
  await settle(page, 'Upload firmware release');
  await page.getByLabel('Device name').click();
  await page.getByRole('option', { name: /Factory 1 gateway/u }).click();
  await expect(
    page
      .getByRole('region', { name: 'Deploy firmware' })
      .getByRole('combobox', { name: 'Firmware release' }),
  ).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  const uploadPanel = page.getByRole('region', { name: 'Upload firmware release' });
  const rolloutPanel = page.getByRole('region', { name: 'Create staged rollout' });
  const [uploadBox, rolloutBox] = await Promise.all([
    uploadPanel.boundingBox(),
    rolloutPanel.boundingBox(),
  ]);

  expect(uploadBox).not.toBeNull();
  expect(rolloutBox).not.toBeNull();
  const verticalGap = rolloutBox!.y - (uploadBox!.y + uploadBox!.height);
  expect(verticalGap).toBeGreaterThanOrEqual(12);
  expect(verticalGap).toBeLessThanOrEqual(20);

  await expect(page).toHaveScreenshot('devices-firmware-desktop.png', { fullPage: true });

  // Deployment errors are supplied by devices and can be substantially longer
  // than the deterministic fixture. They must scroll inside the table instead
  // of widening the two-column firmware layout and the entire workspace.
  const deploymentErrorCell = page
    .getByRole('region', { name: 'Deployment history' })
    .locator('tbody td')
    .last();
  await deploymentErrorCell.evaluate((cell) => {
    cell.textContent =
      'Firmware download returned HTTP -1 (connection refused after all transport retries).';
  });
  const horizontalSizing = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(horizontalSizing.documentWidth).toBeLessThanOrEqual(horizontalSizing.viewportWidth);
});

test('device registry separates provisioning state from connectivity', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/devices');
  await page.getByRole('tab', { name: 'Device registry', exact: true }).click();
  await settle(page, 'Factory 1 gateway');

  await expect(page.getByRole('columnheader', { name: 'Provisioning state' })).toBeVisible();
  await expect(page.getByText('Healthy', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark active' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark faulty' })).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Provisioning state' }).click();
  await expect(page.getByRole('option', { name: 'COMMISSIONED', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'ACTIVE', exact: true })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'FAULTY', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('device health and alerts section matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/devices');
  await page.getByRole('tab', { name: 'Health & monitoring', exact: true }).click();
  await settle(page, 'Device alerts');
  await page.getByRole('combobox', { name: 'Device diagnostics' }).click();
  await page.getByRole('option', { name: 'Factory 1 gateway', exact: true }).click();
  await settle(page, 'LTE reconnect required');
  await expect(page.getByRole('columnheader', { name: 'MQTT state' })).toHaveCount(0);
  await expect(page.getByText('Healthy', { exact: true }).first()).toBeVisible();

  await expect(page).toHaveScreenshot('devices-health-desktop.png', { fullPage: true });
});

test('device remote configuration section matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/devices');
  await page.getByRole('tab', { name: 'Remote configuration', exact: true }).click();
  await settle(page, 'Push device configuration');
  await page.getByLabel('Device name').click();
  await page.getByRole('option', { name: 'Factory 1 gateway', exact: true }).click();
  await settle(page, 'Desired / applied / reported versions');

  await expect(page).toHaveScreenshot('devices-configuration-desktop.png', { fullPage: true });
});

test('data connection editor form matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/connections');
  await settle(page, 'analytics-primary');

  await page.getByRole('button', { name: /New connection/ }).click();
  await settle(page, 'Host');

  await expect(page).toHaveScreenshot('database-sources-form.png', { fullPage: true });
});

test('pipeline flow canvas matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/databases/analytics?tab=pipelines');
  await settle(page, 'Daily order load');

  await page.getByRole('link', { name: 'Daily order load' }).first().click();
  await settle(page, 'Sources');

  await expect(page).toHaveScreenshot('pipelines-canvas.png', { fullPage: true });
});

test('pipeline create-new Iceberg target matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/databases/analytics?tab=pipelines');
  await settle(page, 'Daily order load');

  await page.getByRole('link', { name: 'Daily order load' }).first().click();
  await settle(page, 'Targets');
  // The palette groups are tabs now, so the target list is opened rather than
  // scrolled to.
  await page.getByRole('tab', { name: /Targets/ }).click();
  await page.getByRole('button', { name: 'Add' }).first().click();

  const properties = page.getByRole('complementary', { name: 'Node properties' });
  await properties.getByLabel('Table option').selectOption('CREATE_NEW');
  await properties.getByLabel('Database', { exact: true }).selectOption('analytics');
  await properties.getByLabel('New table name').fill('daily_customer_snapshot');

  await expect(properties.getByLabel('Existing table', { exact: true })).toHaveCount(0);
  await expect(properties.getByLabel('Write mode', { exact: true })).toHaveCount(0);
  await expect(page).toHaveScreenshot('pipelines-target-create-new.png', { fullPage: true });
});

test('execution detail matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/executions');
  await settle(page, 'Run executions');

  // Scoped to the list, because the status filter above it is also a button
  // reading "Succeeded".
  await page
    .getByLabel('Runs, newest first')
    .getByRole('button', { name: /Succeeded/u })
    .first()
    .click();
  await settle(page, 'spark-');

  await expect(page).toHaveScreenshot('executions-detail.png', {
    fullPage: true,
    mask: masks(page),
  });
});

test('query result matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/sql');
  await settle(page, 'History');

  await page
    .getByRole('button', { name: /SELECT order_date/ })
    .first()
    .click();
  await settle(page, 'order_date');

  await expect(page).toHaveScreenshot('sql-result.png', {
    fullPage: true,
    mask: masks(page),
  });
});

test('catalog table detail matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/catalog/tables');
  await settle(page, 'orders');

  await page.getByRole('button', { name: 'orders', exact: true }).click();
  await settle(page, 'customer_id');

  await expect(page).toHaveScreenshot('catalog-detail.png', {
    fullPage: true,
    mask: masks(page),
  });
});

test('catalog create database dialog matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/catalog/databases');
  await settle(page, 'Databases (2)');

  await page.getByRole('button', { name: 'Create database' }).click();
  await page.getByRole('dialog', { name: 'Create a database' }).waitFor();

  await expect(page).toHaveScreenshot('catalog-create-database.png', { fullPage: true });
});

test('catalog edit database description dialog matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/catalog/databases');
  await settle(page, 'Curated metrics and reporting data.');

  await page.getByRole('button', { name: 'Edit description' }).first().click();
  await page.getByRole('dialog', { name: 'Edit description for analytics' }).waitFor();

  await expect(page).toHaveScreenshot('catalog-edit-database-description.png', { fullPage: true });
});

async function chooseTable(
  picker: Locator,
  table: string,
  options: { readonly catalog?: string; readonly schema?: string } = {},
): Promise<void> {
  await picker.getByRole('button', { name: options.catalog ?? 'iceberg', exact: true }).click();
  await picker.getByRole('button', { name: options.schema ?? 'analytics', exact: true }).click();
  await picker.getByRole('button', { name: new RegExp(`^${table}(?:\\s|$)`, 'u') }).click();
}

async function chooseGroupedField(
  page: Page,
  trigger: Locator,
  pickerLabel: string,
  groupLabel: string,
  fieldLabel: string,
): Promise<void> {
  await trigger.click();
  const picker = page.getByRole('listbox', { name: `${pickerLabel} options`, exact: true });
  const group = picker.getByRole('button', { name: `${groupLabel} fields`, exact: true });
  await expect(group).toBeVisible();
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    // The collision-positioned popover can keep moving while its mobile
    // entrance animation settles. Dispatch the visible control's click and
    // verify the requested option below instead of waiting on pixel stability.
    await group.dispatchEvent('click');
  }
  // Selecting a field can immediately commit a pending join and unmount the
  // popover in the same event. Dispatch the already-visible option click so
  // Playwright does not retry against the intentionally detached node.
  await picker.getByRole('option', { name: fieldLabel, exact: true }).dispatchEvent('click');
}

test('chart viewport keeps the chart type footer reachable at 100% zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await mockCoreApi(page);
  await page.goto('/analytics/charts/chart-manual-1/edit');

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const footerControl = page.getByRole('button', { name: 'Chart type', exact: true });
  await expect(footerControl).toBeVisible();
  const box = await footerControl.boundingBox();

  expect(box).not.toBeNull();
  expect((box?.y ?? Infinity) + (box?.height ?? Infinity)).toBeLessThanOrEqual(700);
});

/**
 * The entry screen had no baseline, which is how its two option cards shipped
 * with their descriptions clipped: `Button`'s base class carries
 * `whitespace-nowrap`, so prose inside one cannot wrap. Every other builder
 * state was covered; this one was only ever passed through on the way to them.
 */
for (const width of [1440, 390]) {
  test(`chart builder entry choice at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCoreApi(page);
    await page.goto('/analytics/charts/new');

    const question = page.getByRole('button', { name: /^New question/u });
    await expect(question).toBeVisible();
    await expect(page.getByRole('button', { name: /^New SQL query/u })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Close the editor' })).toBeVisible();

    // The description has to be inside the card, not running off its side.
    const card = await question.boundingBox();
    const text = await question.getByText(/step by step/u).boundingBox();
    expect(card).not.toBeNull();
    expect(text).not.toBeNull();
    expect(text!.x + text!.width).toBeLessThanOrEqual(card!.x + card!.width);

    await expect(page).toHaveScreenshot(`chart-builder-entry-${width}.png`, { fullPage: true });
  });
}

for (const width of [1440, 390]) {
  test(`chart builder progressive question flow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCoreApi(page);
    let previewRequests = 0;
    let queryPreviewRequests = 0;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'POST' && url.pathname.endsWith('/chart-authoring/previews')) {
        previewRequests += 1;
      }
      if (request.method() === 'POST' && url.pathname.endsWith('/chart-authoring/query-previews')) {
        queryPreviewRequests += 1;
      }
    });

    await page.goto('/analytics/charts/new');
    await page.getByRole('button', { name: /^New question/u }).click();

    // One header. The surface used to open with its own eyebrow and `<h1>`
    // directly under the builder's, so the screen carried two page titles.
    await expect(page.getByRole('region', { name: 'Data step' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Catalogs', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Schemas', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Tables', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pick your starting data' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Close the editor' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Filter step', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Summarize step', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Sort and limit step', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Visualize', exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: /workspace/i })).toHaveCount(0);

    await expect(page).toHaveScreenshot(`chart-builder-question-picker-${width}.png`, {
      fullPage: true,
      mask: masks(page),
    });

    const picker = page.getByRole('region', { name: 'Data step', exact: true });
    const catalogs = picker.getByRole('list', { name: 'Catalogs', exact: true });
    await expect(catalogs).toBeVisible();
    expect(await catalogs.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    // All three levels are on the page, so the "Browse all data" dialog that
    // held the same lists at a quarter the width has nothing left to offer.
    await expect(page.getByRole('button', { name: 'Browse all data' })).toHaveCount(0);
    await expect(picker.getByRole('list', { name: 'Schemas', exact: true })).toBeVisible();
    await expect(picker.getByRole('list', { name: 'Tables', exact: true })).toBeVisible();

    await chooseTable(picker, 'orders');
    await expect(page.getByRole('region', { name: 'Data step', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Filter step', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Summarize step', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add join', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Join data', exact: true })).toHaveCount(0);

    if (width === 1440) {
      // 72, not 68: the cell sizes on the 4px spacing scale now. The old
      // number came from `min-h-[68px]` with `p-[14px]`, neither of which is a
      // step on any scale this app declares.
      expect((await page.getByTestId('notebook-step-content').first().boundingBox())?.height).toBe(
        72,
      );
      const sourceTableChip = page.getByRole('group', { name: 'Source table', exact: true });
      expect((await sourceTableChip.boundingBox())?.height).toBe(40);
      await expect(page).toHaveScreenshot('chart-builder-source-selected-1440.png', {
        fullPage: true,
        mask: masks(page),
      });
    }

    const addJoin = page.getByRole('button', { name: 'Add join', exact: true });
    await addJoin.click();
    const joinPicker = page.locator(
      '[aria-label="Join data"] section[aria-label="Data source picker"]',
    );
    await chooseTable(joinPicker, 'daily_orders');
    await expect(page.getByRole('region', { name: 'Join data', exact: true }).last()).toBeVisible();

    await chooseGroupedField(
      page,
      page.getByRole('button', { name: 'Join 1 left field 1', exact: true }),
      'Join 1 left field 1',
      'Orders',
      'Order ID',
    );
    await chooseGroupedField(
      page,
      page.getByRole('button', { name: 'Join 1 right field 1', exact: true }),
      'Join 1 right field 1',
      'Daily Orders',
      'Order ID',
    );

    const filter = page.getByRole('region', { name: 'Filter step', exact: true });
    await filter
      .getByRole('button', { name: 'Add filters to narrow your answer', exact: true })
      .click();
    await chooseGroupedField(
      page,
      filter.getByRole('button', { name: 'Filter field', exact: true }),
      'Filter field picker',
      'Orders',
      'Order ID',
    );
    await filter.getByLabel('Filter value', { exact: true }).fill('1');
    await filter.getByRole('button', { name: 'Add filter', exact: true }).last().click();

    const summarize = page.getByRole('region', { name: 'Summarize step', exact: true });
    await summarize.getByRole('button', { name: 'Pick a function or metric', exact: true }).click();
    await summarize.getByRole('option', { name: 'Count a field', exact: true }).click();
    await chooseGroupedField(
      page,
      summarize.getByRole('button', { name: 'Measure field', exact: true }),
      'Measure field picker',
      'Orders',
      'Order ID',
    );
    await summarize.getByRole('button', { name: 'Add measure', exact: true }).click();
    await chooseGroupedField(
      page,
      summarize.getByRole('button', { name: 'Pick a column to group by', exact: true }),
      'Breakout field picker',
      'Orders',
      'Order Date',
    );

    await expect(page.getByRole('button', { name: 'Visualize', exact: true })).toBeVisible();
    if (width === 1440) {
      for (const testId of [
        'join-table-band',
        'join-condition-band',
        'measure-band',
        'breakout-band',
      ]) {
        expect((await page.getByTestId(testId).boundingBox())?.height).toBe(72);
      }
      await expect(page).toHaveScreenshot('chart-builder-query-configured-1440.png', {
        fullPage: true,
        mask: masks(page),
      });
    }

    await page.getByRole('button', { name: 'Run preview', exact: true }).click();
    const queryPreview = page.getByRole('region', { name: 'Query result preview', exact: true });
    await expect(queryPreview).toBeVisible();
    await expect(queryPreview.getByRole('table')).toBeVisible();
    await expect(queryPreview.getByRole('img')).toHaveCount(0);
    if (width === 1440) {
      await expect(page).toHaveScreenshot('chart-builder-query-preview-1440.png', {
        fullPage: true,
        mask: masks(page),
      });
    }

    await page.getByRole('button', { name: 'Visualize', exact: true }).click();

    // At 390 the settings panel is a modal sheet, which `aria-hidden`s the page
    // behind it — so it has to be dismissed before the canvas is assertable,
    // and reopened to reach the type row.
    const settingsSheet = page.getByRole('dialog', {
      name: 'Visualization settings',
      exact: true,
    });
    const typePicker = page.getByRole('group', { name: 'Chart type', exact: true });

    async function openTypePicker() {
      if (width !== 390) return;
      await page.getByRole('button', { name: 'Chart type', exact: true }).click();
      await expect(settingsSheet).toBeVisible();
    }
    async function closeTypePicker() {
      if (width !== 390) return;
      await settingsSheet.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(settingsSheet).toBeHidden();
    }
    async function chooseType(name: string) {
      await openTypePicker();
      await typePicker.getByRole('button', { name, exact: true }).click();
      await closeTypePicker();
    }

    // A date column and a measure is a line chart. Every result used to land on
    // Table regardless of what came back, and the only route to a chart was a
    // floating pill labelled "Visualization" at the bottom of the canvas.
    await expect(typePicker).toBeVisible();
    await expect(typePicker.getByRole('button', { name: 'Line', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await closeTypePicker();

    await expect(
      page.getByRole('main', { name: 'Visualization result', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Visualization', exact: true })).toHaveCount(0);
    expect(queryPreviewRequests).toBe(2);
    expect(previewRequests).toBe(1);

    if (width === 1440) {
      await expect(page).toHaveScreenshot('chart-builder-visualization-picker-1440.png', {
        fullPage: true,
        mask: masks(page),
      });
    }

    // The rows are one click away rather than always stacked under the chart.
    await chooseType('Table');
    await expect(page.getByText('128', { exact: true })).toBeVisible();

    await chooseType('Bar');
    await expect(page.getByRole('region', { name: 'Bar chart data', exact: true })).toHaveCount(
      width === 390 ? 0 : 1,
    );
    const barPreview = page.getByRole('img', { name: 'BAR chart preview', exact: true });
    await expect(barPreview).toBeVisible();
    await expect(barPreview.locator('svg').first()).toBeVisible({ timeout: 10_000 });
    // Recharts draws DOM SVG carrying the palette token, so the mark's fill is
    // `var(--mchart-1)` rather than a literal — that indirection is the whole
    // point of the renderer, so assert on it rather than on a resolved hex.
    await expect(barPreview.locator('svg [fill*="--mchart-"]').first()).toBeAttached({
      timeout: 10_000,
    });
    await expect(
      width === 390 ? page.getByRole('button', { name: 'Chart type', exact: true }) : typePicker,
    ).toBeVisible();
    if (width === 1440) {
      await expect(page).toHaveScreenshot('chart-builder-visualization-1440.png', {
        fullPage: true,
        mask: masks(page),
      });
    } else {
      await expect(page).toHaveScreenshot('chart-builder-visualization-390.png', {
        fullPage: true,
        mask: masks(page),
      });
    }

    if (width === 1440) {
      await page.getByRole('tab', { name: 'Display', exact: true }).click();
      await expect(page.getByRole('switch', { name: 'Show values on data points' })).toBeVisible();
      await expect(page).toHaveScreenshot('chart-builder-config-display-1440.png', {
        fullPage: true,
        mask: masks(page),
      });

      await page.getByRole('tab', { name: 'Axes', exact: true }).click();
      await expect(page.getByRole('group', { name: 'X-axis', exact: true })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Y-axis', exact: true })).toBeVisible();
      await expect(page).toHaveScreenshot('chart-builder-config-axes-1440.png', {
        fullPage: true,
        mask: masks(page),
      });

      await page.getByRole('tab', { name: 'Data', exact: true }).click();
      await page.getByRole('button', { name: 'order_count series settings', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Style', exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Formatting', exact: true })).toBeVisible();
      await expect(page).toHaveScreenshot('chart-builder-series-style-1440.png', {
        fullPage: true,
        mask: masks(page),
      });
      await page.keyboard.press('Escape');
    }

    await chooseType('Pie');
    await expect(page.getByRole('region', { name: 'Pie chart data', exact: true })).toHaveCount(
      width === 390 ? 0 : 1,
    );
    // With the panel closed the canvas keeps one control that reopens it,
    // rather than a pill that opened a separate chooser mode.
    await expect(
      width === 390 ? page.getByRole('button', { name: 'Chart type', exact: true }) : typePicker,
    ).toBeVisible();
    expect(queryPreviewRequests).toBe(2);
    expect(previewRequests).toBe(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

test('chart builder native SQL flow selects catalog and schema before preview', async ({
  page,
}) => {
  await mockCoreApi(page);
  await page.goto('/analytics/charts/new');
  await page.getByRole('button', { name: /^New SQL query/u }).click();

  const picker = page.locator('section[aria-label="Data source picker"]');
  await picker.getByRole('button', { name: 'iceberg', exact: true }).click();
  await picker.getByRole('button', { name: 'analytics', exact: true }).click();
  await expect(page.getByLabel('Query context', { exact: true })).toHaveText('iceberg.analytics');
  await expect(page.getByRole('region', { name: 'SQL editor', exact: true })).toBeVisible();

  const runPreview = page.getByRole('button', { name: 'Run preview', exact: true });
  await expect(runPreview).toBeEnabled();
  await runPreview.click();
  await expect(page.getByText(/Preview succeeded/i)).toBeVisible();
  await expect(page).toHaveScreenshot('chart-builder-native-sql.png', {
    fullPage: true,
    mask: masks(page),
  });
});

test('account password dialog matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/connections');
  await settle(page, 'analytics-primary');

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Change password' }).click();
  await page.getByRole('dialog', { name: 'Change your password' }).waitFor();

  await expect(page).toHaveScreenshot('account-password-dialog.png');
});

test('workspace sidebar matches the visual baseline in Vietnamese', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/connections');
  await settle(page, 'analytics-primary');

  await page.getByRole('button', { name: 'Tiếng Việt' }).click();
  await page.waitForTimeout(300);

  await expect(page.locator('aside').first()).toHaveScreenshot('sidebar-vi.png');
});

test('collapsed sidebar matches the visual baseline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/connections');
  await settle(page, 'analytics-primary');

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(300);

  await expect(page.locator('aside').first()).toHaveScreenshot('sidebar-collapsed.png');
});

/**
 * The old header pushed its action cluster off-screen because ten long labels
 * never fit one row. A sidebar cannot overflow horizontally the same way, but a
 * long label in either locale can still spill past the 268px rail, so the same
 * risk is asserted numerically rather than left to a screenshot at one width.
 */
test('workspace navigation never overflows the rail in either locale', async ({ page }) => {
  await mockCoreApi(page);

  for (const vietnamese of [false, true]) {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto('/connections');
    await settle(page, 'analytics-primary');

    if (vietnamese) {
      await page.getByRole('button', { name: 'Tiếng Việt' }).click();
      await page.waitForTimeout(200);
    }

    const overflow = await page.evaluate(() => {
      const navigation = document.querySelector('nav');
      if (!navigation) {
        throw new Error('workspace navigation not found');
      }
      return navigation.scrollWidth - navigation.clientWidth;
    });

    expect(overflow, vietnamese ? 'vi' : 'en').toBeLessThanOrEqual(0);
  }
});

test('workspace navigation menu matches the visual baseline on a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await mockCoreApi(page);
  await page.goto('/connections');
  await settle(page, 'analytics-primary');

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.waitForTimeout(200);

  // The rail comes in as a left-edge overlay, so the viewport is the frame.
  await expect(page).toHaveScreenshot('sidebar-menu-open.png');
});

test('data connections page matches the visual baseline at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await mockCoreApi(page);
  await page.goto('/connections');
  await settle(page, 'analytics-primary');

  await expect(page).toHaveScreenshot('database-sources-narrow.png', { fullPage: true });
});

/**
 * The chat landing, which had no visual baseline at all.
 *
 * The opening screen centres on the composer: greeting above it, ideas below,
 * the whole block in the middle of the page. It drops to the bottom only once
 * there is a conversation to sit under, which is a different screen.
 */
test('chat landing centres the composer with the ideas under it', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/chat');

  const heading = page.getByRole('heading', { name: 'What can I help you analyze?' });
  await expect(heading).toBeVisible();
  await expect(page.getByText('Connected to workspace data')).toBeVisible();

  const composer = page.getByRole('textbox', { name: 'Chat prompt' });
  const composerBox = await composer.boundingBox();
  const headingBox = await heading.boundingBox();
  const ideas = page.getByRole('button', { name: /Explore my data catalog/u });
  const ideasBox = await ideas.boundingBox();
  const viewport = page.viewportSize();

  // Greeting, then composer, then the ideas: one block, read top to bottom.
  expect(headingBox?.y ?? 0).toBeLessThan(composerBox?.y ?? 0);
  expect(composerBox?.y ?? 0).toBeLessThan(ideasBox?.y ?? 0);

  // And that block sits around the middle rather than hugging either edge.
  const middle = (viewport?.height ?? 900) / 2;
  expect(composerBox?.y ?? 0).toBeLessThan(middle);
  expect((composerBox?.y ?? 0) + (composerBox?.height ?? 0)).toBeGreaterThan(middle / 2);

  await expect(page).toHaveScreenshot('chat-landing.png', { fullPage: true });
});

/**
 * The same screen on a frame too short to hold it.
 *
 * Centring a scroll container with `items-center` keeps centring once the
 * content outgrows the frame, so it overflows equally both ways and the top is
 * pushed above scroll origin where nothing can reach it. Auto margins collapse
 * instead, which is the only reason this screen still opens on its greeting.
 */
test('chat landing stays reachable when the window is too short for it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await mockCoreApi(page);
  await page.goto('/chat');

  const badge = page.getByText('Connected to workspace data');
  await expect(badge).toBeVisible();

  const scroller = page.locator('main section > div').filter({ has: badge });
  const [frame, first] = await Promise.all([scroller.boundingBox(), badge.boundingBox()]);

  // Nothing sits above where scrolling can start.
  expect(first?.y ?? 0).toBeGreaterThanOrEqual(frame?.y ?? 0);
  // And the greeting is what the screen opens on.
  await expect(
    page.getByRole('heading', { name: 'What can I help you analyze?' }),
  ).toBeInViewport();
});

test('skills detail shows the index line the agent routes on', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/skills');
  await settle(page, 'Project skills');
  await page.getByRole('button', { name: 'daily-yield-report', exact: true }).click();
  await settle(page, 'How the agent sees this skill');
  await expect(page.getByRole('heading', { name: 'daily-yield-report' })).toBeVisible();
  await expect(page).toHaveScreenshot('skills-detail.png', { fullPage: true });
});

test('skills library filters and warns about an undescribed skill', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/skills');
  await settle(page, 'Project skills');
  // Eight skills is the threshold at which the filter earns its place.
  await expect(page.getByText('The agent has only the name to decide from.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search skills' }).fill('reporting');
  await expect(page.getByRole('button', { name: 'null-audit', exact: true })).toBeHidden();
  await expect(page).toHaveScreenshot('skills-filtered.png', { fullPage: true });
});

test('skills docks the assistant only when asked', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/skills');
  await settle(page, 'Project skills');
  // Closed by default now, as on every other surface that docks a panel.
  await expect(page.getByRole('heading', { name: 'Ask about your skills' })).toBeHidden();
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await settle(page, 'Ask about your skills');
  await expect(page).toHaveScreenshot('skills-assistant.png', { fullPage: true });
});

test('skills at 390px stacks the library above the editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCoreApi(page);
  await page.goto('/skills');
  await settle(page, 'Project skills');
  await expect(page).toHaveScreenshot('skills-narrow.png', { fullPage: true });
});

