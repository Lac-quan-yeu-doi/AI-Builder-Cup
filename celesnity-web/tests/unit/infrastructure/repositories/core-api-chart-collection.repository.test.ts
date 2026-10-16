import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiChartCollectionRepository } from '@/src/infrastructure/repositories/core-api-chart-collection.repository';

class FakeTransport implements GeneratedApiTransport {
  public readonly requests: { readonly path: string; readonly init?: RequestInit }[] = [];

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    return {
      id: 'collection-1',
      organization_id: 'org-1',
      parent_id: 'root-1',
      name: 'Finance',
      type: 'COLLECTION',
      access: 'CURATE',
    } as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream is not used by chart collections');
  }
}

describe('CoreApiChartCollectionRepository', () => {
  it('creates a collection using only fields accepted by the Core contract', async () => {
    const transport = new FakeTransport();
    const repository = new CoreApiChartCollectionRepository(transport);

    await repository.create({ name: 'Finance', description: null, parentId: 'root-1' });

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.path).toBe('/chart-collections');
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      name: 'Finance',
      parent_id: 'root-1',
    });
  });
});
