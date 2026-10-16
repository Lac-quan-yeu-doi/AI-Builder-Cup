import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
await page.route('**/api/v1/**', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      {
        id: '1',
        name: 'analytics-primary',
        type: 'POSTGRESQL',
        host: 'postgres.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'celesnity_app',
        sslMode: 'require',
        options: { applicationName: 'celesnity-web' },
        verificationStatus: 'SUCCEEDED',
        lastTestedAt: '2026-02-01T09:15:00.000Z',
        createdAt: '2026-01-04T08:00:00.000Z',
        updatedAt: '2026-02-01T09:15:00.000Z',
      },
    ]),
  }),
);
await page.goto('http://127.0.0.1:3100/connections');
await page.getByText('analytics-primary').first().waitFor();
await page.waitForTimeout(600);
console.log(
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('article button')];
    const rows = btns.map((b) => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return `${b.textContent.trim()}: w=${r.width.toFixed(1)} h=${r.height.toFixed(1)} pad=${cs.padding} font=${cs.fontSize}/${cs.lineHeight} fw=${cs.fontWeight} minh=${cs.minHeight}`;
    });
    const parent = btns[0]?.parentElement.getBoundingClientRect();
    const card = document.querySelector('article').getBoundingClientRect();
    return [
      ...rows,
      `actions: h=${parent?.height.toFixed(1)}`,
      `card: h=${card.height.toFixed(1)}`,
    ].join('\n');
  }),
);
await browser.close();
