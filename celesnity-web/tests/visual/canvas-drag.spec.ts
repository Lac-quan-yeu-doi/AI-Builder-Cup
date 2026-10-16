import { expect, test, type Page } from '@playwright/test';

import { mockCoreApi } from './core-api-mock';

/**
 * Behavioural, not visual: dragging a node used to round-trip every pointer
 * frame through the domain graph, which handed React Flow a rebuilt node object
 * each frame and made it repaint without its measurements. The canvas now owns
 * the node array during a drag and commits once on release, so the assertions
 * here are "the node followed the pointer" and "the graph was edited exactly at
 * the release".
 */
async function openCanvas(page: Page): Promise<void> {
  await mockCoreApi(page);
  await page.goto('/databases/analytics?tab=pipelines');
  await page.getByText('Daily order load', { exact: false }).first().waitFor();

  await page.getByRole('link', { name: 'Daily order load' }).first().click();
  await page.getByText('Sources', { exact: false }).first().waitFor();
}

test('fits the graph without magnifying it past its true size', async ({ page }) => {
  await openCanvas(page);

  const node = page.locator('.react-flow__node').first();
  await expect(node).toBeVisible();

  // `fitView` climbs to `maxZoom` (2 by default) on a small graph, which renders
  // every node at twice its CSS size. The card is 228px wide by design.
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }
  expect(box.width).toBeLessThanOrEqual(200);
});

test('draws a direction arrow on every edge', async ({ page }) => {
  await openCanvas(page);

  const edge = page.locator('.react-flow__edge-path').first();
  await expect(edge).toBeAttached();
  expect(await edge.getAttribute('marker-end')).toBeTruthy();
});

test('dragging a node moves it and commits once the pointer is released', async ({ page }) => {
  await openCanvas(page);

  const node = page.locator('.react-flow__node').first();
  await expect(node).toBeVisible();

  const start = await node.boundingBox();
  expect(start).not.toBeNull();
  if (!start) {
    return;
  }

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 60, start.y + start.height / 2 + 40, {
    steps: 12,
  });

  // Mid-drag the node has followed the pointer and kept its size — a node that
  // lost its measurements collapses before React Flow re-measures it.
  const during = await node.boundingBox();
  expect(during).not.toBeNull();
  if (!during) {
    return;
  }
  expect(during.width).toBeCloseTo(start.width, 0);
  expect(during.height).toBeCloseTo(start.height, 0);
  expect(during.x).toBeGreaterThan(start.x + 40);

  // Nothing is committed to the pipeline until the pointer is released.
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);

  await page.mouse.up();

  await expect(page.getByText('Unsaved changes')).toHaveCount(1);
  const end = await node.boundingBox();
  expect(end).not.toBeNull();
  if (!end) {
    return;
  }
  expect(end.x).toBeCloseTo(during.x, 0);
  expect(end.y).toBeCloseTo(during.y, 0);
});

test('dragging a workflow node follows the pointer without losing its size', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/data-workflows/new');
  await expect(page.getByRole('application', { name: 'Data workflow canvas' })).toBeVisible();

  const node = page.locator('.react-flow__node[data-id="trigger"]');
  const start = await node.boundingBox();
  expect(start).not.toBeNull();
  if (!start) return;

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 60, start.y + start.height / 2 + 40, {
    steps: 12,
  });

  const during = await node.boundingBox();
  expect(during).not.toBeNull();
  if (!during) return;
  expect(during.width).toBeCloseTo(start.width, 0);
  expect(during.height).toBeCloseTo(start.height, 0);
  expect(during.x).toBeGreaterThan(start.x + 40);

  await page.mouse.up();
  const end = await node.boundingBox();
  expect(end).not.toBeNull();
  if (!end) return;
  expect(end.x).toBeCloseTo(during.x, 0);
  expect(end.y).toBeCloseTo(during.y, 0);
});

test('configures a workflow node by choosing a pipeline', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/data-workflows/new');
  await expect(page.getByRole('application', { name: 'Data workflow canvas' })).toBeVisible();

  await page.getByRole('button', { name: 'Pipeline job', exact: true }).click();
  const pipeline = page.getByRole('combobox', { name: 'Pipeline', exact: true });
  await pipeline.click();
  await page.getByRole('option', { name: 'Daily order load · v4 · analytics' }).click();

  await expect(pipeline).toContainText('Daily order load · v4 · analytics');
  await expect(
    page.locator('.react-flow__node').filter({ hasText: 'Daily order load' }),
  ).toBeVisible();
  await expect(page.getByLabel('Pipeline ID', { exact: true })).toHaveCount(0);
});

test('removes a selected workflow connection and node', async ({ page }) => {
  await mockCoreApi(page);
  await page.goto('/data-workflows/new');
  await expect(page.getByRole('application', { name: 'Data workflow canvas' })).toBeVisible();

  await page.getByRole('button', { name: 'Pipeline job', exact: true }).click();
  await page.getByRole('button', { name: 'Connection tools' }).click();
  const target = page.getByLabel('To node');
  const pipelineNodeId = await target.locator('option').last().getAttribute('value');
  expect(pipelineNodeId).toBeTruthy();
  await target.selectOption(pipelineNodeId!);
  await page.getByRole('button', { name: 'Connect selected nodes' }).click();

  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.locator('.react-flow__edge-interaction').click({ force: true });
  await page.getByRole('button', { name: 'Delete connection' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);

  await page.locator(`.react-flow__node[data-id="${pipelineNodeId}"]`).click();
  await page.getByRole('button', { name: 'Delete node' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.react-flow__node[data-id="trigger"]')).toBeVisible();
});
