import { expect, test, type Page } from '@playwright/test';
import { mockCoreApi } from './core-api-mock';

const room = 'message-block-visual-room';
const key = 'message-block-visual-key';
const ending = 'event: heartbeat\ndata: {}\n\nevent: stream_end\ndata: {"reason":"rotation"}\n\n';

async function mockConversation(page: Page) {
  await mockCoreApi(page);
  await page.route('**/api/agent/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/agent', '');
    let value: unknown;
    if (path === '/rooms')
      value = [{ id: room, key, name: 'Stream lifecycle', members: ['chat-assistant'] }];
    else if (
      path === '/sessions' ||
      (path.startsWith('/sessions/') && !path.endsWith('/transcript'))
    )
      value = { id: 'visual-session', pending_question: null };
    else if (path.startsWith('/sessions/') && path.endsWith('/transcript'))
      value = {
        history: [
          { role: 'user', content: 'Earlier prompt' },
          { role: 'assistant', content: 'Earlier answer' },
        ],
      };
    else if (path === `/rooms/${room}/history`)
      value = { room_id: room, truncated: false, runs: [] };
    else if (path === `/rooms/${room}/events`) {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
      return;
    } else {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(value),
    });
  });
  await page.route(`**/api/core/rooms/${room}/message-blocks**`, (route) => {
    const streaming = new URL(route.request().url()).pathname.endsWith('/stream');
    return route.fulfill({
      status: 200,
      contentType: streaming ? 'text/event-stream' : 'application/json',
      body: streaming ? ending : '[]',
    });
  });
}

test('capacity rejection uses the existing chat retry flow and restores the same conversation', async ({
  page,
}) => {
  await mockConversation(page);
  let rejected = true;
  let opened = 0;
  let created = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/agent/rooms')
      created += 1;
  });
  await page.route(`**/api/core/rooms/${room}/message-blocks/stream*`, (route) => {
    opened += 1;
    return route.fulfill(
      rejected
        ? {
            status: 429,
            contentType: 'application/json',
            headers: { 'Retry-After': '10' },
            body: '{"error":{"code":"STREAM_CAPACITY_EXCEEDED"}}',
          }
        : { status: 200, contentType: 'text/event-stream', body: ending },
    );
  });
  const rotationResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/core/rooms/${room}/message-blocks/stream`,
  );
  await page.goto(`/chat?session=${key}`);
  const response = await rotationResponse;
  if (response.status() === 200) await response.finished();
  await expect(page.getByText('Earlier answer', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Too many chat streams are open. Close an unused tab and reconnect.', {
      exact: true,
    }),
  ).toBeVisible();
  rejected = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => opened).toBe(2);
  await expect(
    page.getByText('Too many chat streams are open. Close an unused tab and reconnect.', {
      exact: true,
    }),
  ).toBeHidden();
  await expect(page.getByText('Earlier answer', { exact: true })).toBeVisible();
  expect(created).toBe(0);
});

test('idle rotation pauses until focus after ten minutes and restores through the existing room', async ({
  page,
}) => {
  await page.clock.install();
  await mockConversation(page);
  let openings = 0;
  let historyReads = 0;
  await page.route(`**/api/core/rooms/${room}/message-blocks**`, (route) => {
    const stream = new URL(route.request().url()).pathname.endsWith('/stream');
    if (stream) openings += 1;
    else historyReads += 1;
    return route.fulfill({
      status: 200,
      contentType: stream ? 'text/event-stream' : 'application/json',
      body: stream ? ending : '[]',
    });
  });
  const rotationResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/core/rooms/${room}/message-blocks/stream`,
  );
  await page.goto(`/chat?session=${key}`);
  const response = await rotationResponse;
  if (response.status() === 200) await response.finished();
  await expect(page.getByText('Earlier answer', { exact: true })).toBeVisible();
  await expect.poll(() => openings).toBe(1);
  await page.clock.runFor(600_000);
  expect(openings).toBe(1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => openings).toBe(2);
  expect(historyReads).toBe(2);
  await expect(page.getByText('Earlier answer', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Chat updates stopped. Reconnect to restore the latest conversation state.', {
      exact: true,
    }),
  ).toBeHidden();
});

test('expired authentication during idle restoration returns to sign-in without creating a room', async ({
  page,
}) => {
  await mockConversation(page);
  let expired = false;
  let opened = 0;
  let created = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/agent/rooms')
      created += 1;
  });
  await page.route('**/api/agent/sessions**', async (route) => {
    if (!expired) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"error":{"code":"UNAUTHENTICATED","message":"Sign in is required."}}',
    });
  });
  await page.route(`**/api/core/rooms/${room}/message-blocks/stream*`, (route) => {
    opened += 1;
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ending });
  });
  const rotationResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/core/rooms/${room}/message-blocks/stream`,
  );
  await page.goto(`/chat?session=${key}`);
  const response = await rotationResponse;
  if (response.status() === 200) await response.finished();
  await expect(page.getByText('Earlier answer', { exact: true })).toBeVisible();
  await expect.poll(() => opened).toBe(1);
  // Wait for normal response completion before triggering restoration.
  await expect(page.getByRole('textbox', { name: 'Follow-up prompt' })).toBeEnabled();
  expired = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/login$/);
  expect(opened).toBe(1);
  expect(created).toBe(0);
});

test('cursor reset restores the same room and resumes from recovered history without another send', async ({
  page,
}) => {
  await mockConversation(page);
  const first = '40000000-0000-4000-8000-000000000001';
  const latest = '40000000-0000-4000-8000-000000000002';
  const historyQueries: (string | null)[] = [];
  const streamQueries: (string | null)[] = [];
  const requestIds: (string | undefined)[] = [];
  let mutations = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/agent/'))
      mutations += 1;
  });
  const block = (id: string) => ({
    id,
    room_id: room,
    run_id: null,
    block_type: 'text',
    version: 1,
    payload: { text: 'Earlier answer' },
    fallback_text: 'Earlier answer',
    published_at: '2026-10-01T00:00:00Z',
  });
  await page.route(`**/api/core/rooms/${room}/message-blocks**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/stream')) {
      streamQueries.push(url.searchParams.get('cursor'));
      requestIds.push(route.request().headers()['x-request-id']);
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body:
          streamQueries.length === 1
            ? 'event: stream_reset\ndata: {"code":"MESSAGE_BLOCK_CURSOR_INVALID","recovery":"reload_room_state"}\n\n'
            : ending,
      });
    } else {
      historyQueries.push(url.searchParams.get('cursor'));
      const blocks =
        historyQueries.length === 1
          ? [block(first)]
          : url.searchParams.has('cursor')
            ? []
            : [block(first), block(latest)];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(blocks),
      });
    }
  });
  await page.goto(`/chat?session=${key}`);
  await expect.poll(() => historyQueries.length).toBe(2);
  expect(historyQueries).toEqual([null, null]);
  expect(streamQueries).toEqual([first]); // idle after reset; no retry loop
  await expect(
    page.getByText('Chat updates stopped. Reconnect to restore the latest conversation state.', {
      exact: true,
    }),
  ).toBeHidden();
  await expect(page.getByText('Earlier answer', { exact: true }).first()).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => streamQueries.length).toBe(2);
  expect(streamQueries).toEqual([first, latest]);
  expect(historyQueries.at(-1)).toBe(latest);
  expect(requestIds.every((id) => id && /^[0-9a-f-]{36}$/.test(id))).toBe(true);
  expect(new Set(requestIds).size).toBe(2);
  expect(mutations).toBe(0);
  await page.screenshot({
    path: 'tests/visual/.artifacts/message-block-cursor-restored.png',
    fullPage: true,
  });
});
