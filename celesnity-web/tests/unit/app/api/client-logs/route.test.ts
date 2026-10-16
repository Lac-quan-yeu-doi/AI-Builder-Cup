import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/client-logs/route';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('client log ingestion', () => {
  it('writes a sanitized client failure to the frontend application log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = new Request('http://localhost/api/client-logs', {
      body: JSON.stringify({
        event: 'core_api_request_failed',
        error: 'Failed to fetch',
        nested: { password: 'not logged' },
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('frontend_client_telemetry'));
    expect(error.mock.calls[0]?.[0]).not.toContain('not logged');
  });

  it('rejects malformed JSON', async () => {
    const request = new Request('http://localhost/api/client-logs', {
      body: '{',
      method: 'POST',
    });

    await expect(POST(request)).resolves.toMatchObject({ status: 400 });
  });

  it('rejects an oversized body when content-length is absent', async () => {
    const request = new Request('http://localhost/api/client-logs', {
      body: JSON.stringify({ message: 'x'.repeat(8_192) }),
      method: 'POST',
    });

    expect(request.headers.has('content-length')).toBe(false);
    await expect(POST(request)).resolves.toMatchObject({ status: 413 });
  });
});
