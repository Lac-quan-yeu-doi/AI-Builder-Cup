import { expect, test, type Locator, type Page } from '@playwright/test';

import { mockCoreApi } from './core-api-mock';

const VIEWPORTS = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
] as const;

const RAW_COLOR_CLASS =
  /(?:^|\s)(?:bg|border|fill|ring|text)-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-|\/|\s|$)/u;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/iu;
const SEMANTIC_COLOR_CLASS =
  /(?:^|\s)(?:bg|border|fill|ring|text)-(?:background|card|card-foreground|foreground|muted|muted-foreground|primary|primary-foreground|secondary|secondary-foreground|accent|accent-foreground|border|input|ring|destructive|status-(?:warning|success|info)(?:-light|-dark)?)(?:\/\d+)?(?:\s|$)/u;

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

async function expectSurfaceInViewport(
  page: Page,
  surface: Locator,
  viewport: (typeof VIEWPORTS)[number],
): Promise<void> {
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (box === null) {
    throw new Error('Expected tutorial surface to have a bounding box.');
  }
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

  const horizontalSizing = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(horizontalSizing.documentWidth).toBeLessThanOrEqual(horizontalSizing.viewportWidth);
}

async function expectDesignTokenColors(surface: Locator): Promise<void> {
  const classes = await surface.evaluate((root) =>
    [root, ...root.querySelectorAll('*')]
      .map((element) => element.getAttribute('class') ?? '')
      .filter((className) => className.length > 0),
  );

  expect(classes.some((className) => SEMANTIC_COLOR_CLASS.test(className))).toBe(true);
  expect(classes.filter((className) => RAW_COLOR_CLASS.test(className))).toEqual([]);
  expect(classes.filter((className) => HEX_COLOR.test(className))).toEqual([]);
}

async function expectPositiveCutout(cutout: Locator): Promise<void> {
  await expect(cutout).toHaveCount(1);
  const size = await cutout.evaluate((element) => ({
    height: Number(element.getAttribute('height')),
    width: Number(element.getAttribute('width')),
  }));
  expect(size.width).toBeGreaterThan(0);
  expect(size.height).toBeGreaterThan(0);
}

async function expectNoOverlap(first: Locator, second: Locator): Promise<void> {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (firstBox === null || secondBox === null) {
    throw new Error('Expected spotlight target and panel to have bounding boxes.');
  }

  const overlaps =
    firstBox.x < secondBox.x + secondBox.width &&
    firstBox.x + firstBox.width > secondBox.x &&
    firstBox.y < secondBox.y + secondBox.height &&
    firstBox.y + firstBox.height > secondBox.y;
  expect(overlaps).toBe(false);
}

async function capture(
  page: Page,
  surface: Locator,
  viewport: (typeof VIEWPORTS)[number],
  name: string,
): Promise<void> {
  await settle(page);
  await expectSurfaceInViewport(page, surface, viewport);
  await expectDesignTokenColors(surface);
  await expect(page).toHaveScreenshot(`tutorial-${name}-${viewport.name}.png`, {
    fullPage: true,
  });
}

for (const viewport of VIEWPORTS) {
  test(`guided tutorial surfaces at the ${viewport.name} viewport`, async ({ page }) => {
    const unfulfilledCoreRequests: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/core/') && response.status() >= 400) {
        unfulfilledCoreRequests.push(
          `${response.request().method()} ${new URL(response.url()).pathname} (${response.status()})`,
        );
      }
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockCoreApi(page, { showTutorialOnboarding: true });
    await page.goto('/connections');

    const onboarding = page.locator('[data-tutorial-surface="onboarding"]');
    await expect(
      onboarding.getByRole('heading', { name: 'Learn the workspace as you go' }),
    ).toBeVisible();
    await capture(page, onboarding, viewport, 'onboarding');

    await page.getByRole('button', { name: 'Open guided tutorials' }).click();
    const catalog = page.locator('[data-tutorial-surface="catalog"]');
    await expect(catalog.getByRole('heading', { name: 'Guided tutorials' })).toBeVisible();
    await expect(
      catalog.getByText('Create your first data connection', { exact: true }),
    ).toBeVisible();
    await capture(page, catalog, viewport, 'catalog');

    await page.goto('/visual-tests/tutorials?surface=detail');
    const detail = page.locator('[data-tutorial-visual-frame]');
    await expect(
      detail.getByRole('heading', { name: 'Create your first data connection' }),
    ).toBeVisible();
    await capture(page, detail, viewport, 'detail');

    await page.goto('/visual-tests/tutorials?surface=spotlight');
    const spotlight = page.locator('[data-tutorial-visual-frame]');
    await expect(
      spotlight.getByRole('heading', { name: 'Open the connection editor' }),
    ).toBeVisible();
    await expect(page.locator('[data-spotlight-overlay]')).toBeVisible();
    await expectPositiveCutout(page.locator('[data-spotlight-cutout="target"]'));
    await expectNoOverlap(page.locator('#tutorial-visual-target'), spotlight);
    await capture(page, spotlight, viewport, 'spotlight');

    await page.goto('/visual-tests/tutorials?surface=walkthrough');
    const walkthrough = page.locator('[data-tutorial-visual-frame]');
    await expect(
      walkthrough.getByRole('heading', { name: 'Review the connection checklist' }),
    ).toBeVisible();
    await expect(page.locator('[data-spotlight-overlay]')).toHaveCount(0);
    await capture(page, walkthrough, viewport, 'walkthrough');

    await page.goto('/visual-tests/tutorials?surface=completion');
    const completion = page.locator('[data-tutorial-visual-frame]');
    await expect(completion.getByRole('heading', { name: 'Tutorial complete' })).toBeVisible();
    await capture(page, completion, viewport, 'completion');

    expect(unfulfilledCoreRequests).toEqual([]);
  });
}
