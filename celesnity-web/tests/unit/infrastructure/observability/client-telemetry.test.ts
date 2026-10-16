// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordCoreApiEvent } from '@/src/infrastructure/observability/client-telemetry';

// jsdom implements neither, and the recorder reaches for both after logging.
const sendBeacon = vi.fn().mockReturnValue(true);
Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as unknown as Response));

afterEach(() => {
  vi.restoreAllMocks();
  sendBeacon.mockClear();
});

describe('recordCoreApiEvent', () => {
  it('says what failed in the message, not only in the object', () => {
    // Next's dev overlay renders a logged object as `{}`, so a failed request
    // used to announce itself as `[CoreApi] {}` and explain nothing.
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recordCoreApiEvent({
      event: 'core_api_request_failed',
      method: 'GET',
      route: '/node-definitions/POSTGRES_SOURCE',
      requestId: 'request-1',
      durationMs: 12,
      status: 409,
      error: 'The node type is disabled.',
    });

    const [message] = error.mock.calls[0] ?? [];
    expect(message).toBe(
      '[CoreApi] GET /node-definitions/POSTGRES_SOURCE failed 409: The node type is disabled.',
    );
  });

  it('leaves the status out when the request never reached Core', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recordCoreApiEvent({
      event: 'core_api_request_failed',
      method: 'POST',
      route: '/pipelines',
      requestId: 'request-2',
      durationMs: 5,
      error: 'Failed to fetch',
    });

    expect(error.mock.calls[0]?.[0]).toBe('[CoreApi] POST /pipelines failed: Failed to fetch');
  });

  it('still carries the full payload for whatever reads the console', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recordCoreApiEvent({
      event: 'core_api_request_failed',
      method: 'GET',
      route: '/catalogs',
      requestId: 'request-3',
      durationMs: 9,
      status: 500,
      error: 'Boom',
    });

    expect(error.mock.calls[0]?.[1]).toMatchObject({
      event: 'core_api_request_failed',
      requestId: 'request-3',
      status: 500,
    });
  });
});
