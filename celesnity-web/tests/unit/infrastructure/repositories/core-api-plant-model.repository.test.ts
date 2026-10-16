import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiPlantModelRepository } from '@/src/infrastructure/repositories/core-api-plant-model.repository';

class Transport implements GeneratedApiTransport {
  public readonly requests: { readonly path: string; readonly init?: RequestInit }[] = [];
  public constructor(private readonly responses: unknown[]) {}
  public async request<T>(path: string, init?: RequestInit): Promise<T> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    return this.responses.shift() as T;
  }
  public stream(): Promise<Response> {
    throw new Error('Not used.');
  }
}

const siteId = 'b0000000-0000-4000-8000-000000000001';
const dashboardId = 'd0000000-0000-4000-8000-000000000001';
const association = {
  siteId,
  dashboardId,
  role: 'overview' as const,
  displayOrder: 0,
  isDefault: true,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
};

describe('CoreApiPlantModelRepository dashboard associations', () => {
  it('lists and associates dashboards through site-scoped endpoints', async () => {
    const transport = new Transport([
      { success: true, data: [association] },
      { success: true, data: [association] },
    ]);
    const repository = new CoreApiPlantModelRepository(transport);

    await expect(repository.listDashboards(siteId)).resolves.toEqual([association]);
    await expect(
      repository.associateDashboard(siteId, dashboardId, {
        role: 'overview',
        displayOrder: 0,
        isDefault: true,
      }),
    ).resolves.toEqual([association]);

    expect(transport.requests).toEqual([
      { path: `/plant-sites/${siteId}/dashboards`, init: { method: 'GET' } },
      {
        path: `/plant-sites/${siteId}/dashboards/${dashboardId}`,
        init: {
          method: 'PUT',
          body: JSON.stringify({ role: 'overview', displayOrder: 0, isDefault: true }),
        },
      },
    ]);
  });

  it('removes only the selected plant dashboard association', async () => {
    const transport = new Transport([undefined]);
    const repository = new CoreApiPlantModelRepository(transport);

    await repository.removeDashboard(siteId, dashboardId);

    expect(transport.requests).toEqual([
      {
        path: `/plant-sites/${siteId}/dashboards/${dashboardId}`,
        init: { method: 'DELETE' },
      },
    ]);
  });
});
