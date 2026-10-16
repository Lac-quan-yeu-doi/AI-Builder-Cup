import { describe, expect, it } from 'vitest';

import { ConflictError } from '@/src/entities/errors/application-errors';
import type { Dashboard } from '@/src/entities/models/dashboard';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import { CoreApiDashboardRepository } from '@/src/infrastructure/repositories/core-api-dashboard.repository';

const dashboardDto = {
  id: 'dashboard-1',
  organization_id: 'org-1',
  collection_id: 'collection-1',
  name: 'Operations',
  description: 'Daily operating view',
  expected_revision: 3,
  tabs: [{ id: 'tab-1', name: 'Overview', order: 0 }],
  cards: [
    {
      id: 'card-1',
      tab_id: 'tab-1',
      kind: 'CHART',
      chart_id: 'chart-1',
      chart_revision_number: 2,
      visualization_overrides: { legend: false },
      geometry: { x: 0, y: 0, width: 12, height: 6 },
    },
  ],
  filters: [
    {
      id: 'filter-1',
      slug: 'created-at',
      label: 'Created at',
      semantic_type: 'DATE_PICKER',
      operator: 'ALL_OPTIONS',
      default_value: null,
      required: false,
      multiple: false,
      values_source: null,
      placement: { kind: 'INLINE_CARD', card_id: 'card-1' },
      order: 0,
    },
  ],
  mappings: [
    {
      filter_id: 'filter-1',
      card_id: 'card-1',
      target: { kind: 'FIELD', field_id: 'field-1' },
    },
  ],
  created_by_identity_id: 'identity-1',
  archived_at: null,
  created_at: '2026-09-05T10:00:00.000Z',
  updated_at: '2026-09-05T10:05:00.000Z',
} as const;

class FakeTransport implements GeneratedApiTransport {
  public readonly requests: { readonly path: string; readonly init?: RequestInit }[] = [];

  public constructor(private readonly responses: readonly unknown[] = [dashboardDto]) {}

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    return this.responses[this.requests.length - 1] as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream is not used by dashboards');
  }
}

describe('CoreApiDashboardRepository', () => {
  it('maps the full dashboard aggregate from Core DTOs', async () => {
    const repository = new CoreApiDashboardRepository(new FakeTransport());

    await expect(repository.get('dashboard-1')).resolves.toMatchObject({
      id: 'dashboard-1',
      collectionId: 'collection-1',
      revision: 3,
      cards: [{ tabId: 'tab-1', chartId: 'chart-1', visualizationOverrides: { legend: false } }],
      filters: [
        { semanticType: 'DATE_PICKER', placement: { kind: 'INLINE_CARD', cardId: 'card-1' } },
      ],
      mappings: [{ filterId: 'filter-1', target: { kind: 'FIELD', fieldId: 'field-1' } }],
    });
  });

  it('uses the dashboard Core contract for create, list, save, copy and archive', async () => {
    const transport = new FakeTransport([
      dashboardDto,
      [
        {
          id: 'dashboard-1',
          collection_id: 'collection-1',
          name: 'Operations',
          description: null,
          expected_revision: 3,
          updated_at: dashboardDto.updated_at,
        },
      ],
      dashboardDto,
      dashboardDto,
      undefined,
    ]);
    const repository = new CoreApiDashboardRepository(transport);

    const created = await repository.create({
      collectionId: 'collection-1',
      name: 'Operations',
      description: null,
    });
    await repository.list('collection-1');
    await repository.save(created);
    await repository.copy({
      sourceDashboardId: created.id,
      collectionId: 'collection-2',
      name: 'Operations copy',
      draft: created,
    });
    await repository.archive(created.id);

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/dashboards',
      '/dashboards?collection_id=collection-1',
      '/dashboards/dashboard-1',
      '/dashboards/dashboard-1/copies',
      '/dashboards/dashboard-1',
    ]);
    expect(transport.requests.map(({ init }) => init?.method ?? 'GET')).toEqual([
      'POST',
      'GET',
      'PUT',
      'POST',
      'DELETE',
    ]);
    expect(JSON.parse(String(transport.requests[2]?.init?.body))).toMatchObject({
      expected_revision: 3,
      collection_id: 'collection-1',
      cards: [{ tab_id: 'tab-1', chart_id: 'chart-1' }],
      filters: [
        { semantic_type: 'DATE_PICKER', placement: { kind: 'INLINE_CARD', card_id: 'card-1' } },
      ],
      mappings: [{ filter_id: 'filter-1', target: { kind: 'FIELD', field_id: 'field-1' } }],
    });
    expect(JSON.parse(String(transport.requests[3]?.init?.body))).toMatchObject({
      collection_id: 'collection-2',
      name: 'Operations copy',
      draft: { expected_revision: 3 },
    });
  });

  it('translates optimistic concurrency conflicts', async () => {
    const transport: GeneratedApiTransport = {
      request: async () => {
        throw new CoreApiError(409, 'Dashboard revision conflict.');
      },
      stream: async () => new Response(),
    };

    await expect(
      new CoreApiDashboardRepository(transport).save(dashboardDto as unknown as Dashboard),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
