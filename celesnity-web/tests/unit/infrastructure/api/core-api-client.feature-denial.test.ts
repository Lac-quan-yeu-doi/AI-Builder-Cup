// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoreApiClient } from '@/src/infrastructure/api/core-api-client';
import { WORKSPACE_ACCESS_DENIED_EVENT } from '@/src/entities/models/workspace-feature';

// Telemetry beacons to `/api/client-logs` whenever `window` exists; it is not
// what these tests are about.
vi.mock('@/src/infrastructure/observability/client-telemetry', () => ({
  recordCoreApiEvent: vi.fn(),
}));

const listeners: (() => void)[] = [];

afterEach(() => {
  for (const remove of listeners.splice(0)) remove();
});

function listenForDenials() {
  const heard = vi.fn();
  window.addEventListener(WORKSPACE_ACCESS_DENIED_EVENT, heard);
  listeners.push(() => window.removeEventListener(WORKSPACE_ACCESS_DENIED_EVENT, heard));
  return heard;
}

function clientAnswering(status: number, body: unknown) {
  return new CoreApiClient({
    baseUrl: 'https://core.example/api/v1',
    fetchImplementation: vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  });
}

describe('CoreApiClient feature denials', () => {
  it('announces a feature denial so the workspace re-reads its access', async () => {
    const heard = listenForDenials();
    const client = clientAnswering(403, {
      error: { code: 'FEATURE_ACCESS_DENIED', message: 'Feature access is denied.' },
    });

    await expect(client.get('/queries')).rejects.toMatchObject({
      status: 403,
      code: 'FEATURE_ACCESS_DENIED',
    });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it.each([
    [403, 'PERMISSION_DENIED'],
    [403, 'MFA_REQUIRED'],
    [404, 'NOT_FOUND'],
  ])('stays quiet for %i %s', async (status, code) => {
    const heard = listenForDenials();
    const client = clientAnswering(status, { error: { code, message: 'Refused.' } });

    await expect(client.get('/queries')).rejects.toMatchObject({ status, code });
    expect(heard).not.toHaveBeenCalled();
  });
});
