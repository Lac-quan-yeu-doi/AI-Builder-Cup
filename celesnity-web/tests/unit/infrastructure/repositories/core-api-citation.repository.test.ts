import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiCitationRepository } from '@/src/infrastructure/repositories/core-api-citation.repository';

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeGeneratedApiTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];
  private readonly responses: unknown[];

  public constructor(...responses: unknown[]) {
    this.responses = [...responses];
  }

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    const response = this.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    return response as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

describe('CoreApiCitationRepository', () => {
  it('posts the batch to /citations/resolve and maps the response', async () => {
    const transport = new FakeGeneratedApiTransport([
      { type: 'chart', id: 'chart-1', found: true, title: 'Revenue by region' },
      { type: 'document', id: 'doc-1', found: true, title: 'report.pdf', page: 3 },
    ]);
    const repository = new CoreApiCitationRepository(transport);

    const result = await repository.resolve([
      { type: 'chart', id: 'chart-1' },
      { type: 'document', id: 'doc-1', page: 3 },
    ]);

    expect(transport.requests[0]).toEqual({
      path: '/citations/resolve',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          citations: [
            { type: 'chart', id: 'chart-1' },
            { type: 'document', id: 'doc-1', page: 3 },
          ],
        }),
      },
    });
    expect(result).toEqual([
      { type: 'chart', id: 'chart-1', found: true, title: 'Revenue by region' },
      { type: 'document', id: 'doc-1', found: true, title: 'report.pdf', page: 3 },
    ]);
  });

  it('passes through found: false without throwing, per the tolerant-of-stale-refs contract', async () => {
    const transport = new FakeGeneratedApiTransport([
      { type: 'chart', id: 'deleted-chart', found: false, title: null },
    ]);
    const repository = new CoreApiCitationRepository(transport);

    const result = await repository.resolve([{ type: 'chart', id: 'deleted-chart' }]);

    expect(result).toEqual([{ type: 'chart', id: 'deleted-chart', found: false, title: null }]);
  });

  it('does not call the transport for an empty batch', async () => {
    const transport = new FakeGeneratedApiTransport();
    const repository = new CoreApiCitationRepository(transport);

    const result = await repository.resolve([]);

    expect(result).toEqual([]);
    expect(transport.requests).toEqual([]);
  });
});
