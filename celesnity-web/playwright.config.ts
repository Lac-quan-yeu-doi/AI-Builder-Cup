import { defineConfig, devices } from '@playwright/test';

const visualPort = process.env.PLAYWRIGHT_PORT ?? '3100';
const visualOrigin = `http://127.0.0.1:${visualPort}`;
const visualCorePort = process.env.PLAYWRIGHT_CORE_PORT ?? '3101';
const visualCoreOrigin = `http://127.0.0.1:${visualCorePort}`;

/**
 * Visual regression harness. Screenshots are the only assertion: the suite exists
 * to prove that a styling change (CSS -> Tailwind) did not move the pixels.
 *
 * The Core API is never contacted; every request is fulfilled from
 * `tests/visual/fixtures.ts`, so runs are deterministic and offline.
 */
export default defineConfig({
  testDir: './tests/visual',
  outputDir: './tests/visual/.artifacts',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.002,
      scale: 'css',
    },
  },
  use: {
    baseURL: visualOrigin,
    colorScheme: 'light',
    deviceScaleFactor: 1,
    locale: 'en-US',
    // `animations: 'disabled'` only freezes CSS; a canvas keeps drawing on
    // requestAnimationFrame. The thinking orb honours reduced motion with a
    // static frame, which is the only way its pixels are the same twice.
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    trace: 'off',
    viewport: { width: 1440, height: 900 },
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'node tests/visual/workspace-access-server.mjs',
      url: `${visualCoreOrigin}/health`,
      env: { PLAYWRIGHT_CORE_PORT: visualCorePort },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // Production build, not `next dev`: the dev overlay and HMR socket add
      // non-deterministic pixels, and the standalone server hydrates reliably.
      command: 'npm run build && npm run start',
      url: `${visualOrigin}/connections`,
      env: {
        // Browser API requests are intercepted by each test. This stub only
        // serves the server-rendered workspace policy bootstrap.
        CORE_API_URL: `${visualCoreOrigin}/api/v1`,
        AGENT_API_URL: `${visualCoreOrigin}/api/v2`,
        NEXT_PUBLIC_CHAT_AGENT_NAME: 'chat-assistant',
        NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME: 'skill-creator',
        NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME: 'plant-model-assistant',
        NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME: 'automation-workflow-editor',
        CELESNITY_AUTH_MODE: 'local-development',
        LOCAL_DEV_AUTH_SIGNING_KEY: 'playwright-local-signing-key-32-bytes-minimum',
        WEB_ORIGIN: visualOrigin,
        VISUAL_TEST_MODE: '1',
        PORT: visualPort,
      },
      // Always rebuild: reusing a server would compare screenshots against a
      // stale bundle and report a styling change as "no diff".
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
