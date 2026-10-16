import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiDashboardRuntimeService } from '@/src/infrastructure/services/core-api-dashboard-runtime.service';

class FakeTransport implements GeneratedApiTransport {
  public readonly requests: { readonly path: string; readonly init?: RequestInit }[] = [];

  public constructor(private readonly responses: readonly unknown[]) {}

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    return this.responses[this.requests.length - 1] as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream is not used by dashboard runtime');
  }
}

describe('CoreApiDashboardRuntimeService', () => {
  it('maps partial execution state and filter target DTOs', async () => {
    const transport = new FakeTransport([
      {
        dashboard_id: 'dashboard-1',
        tab_id: 'tab-1',
        cards: [
          { card_id: 'card-1', state: 'SUCCESS', result: { columns: [], rows: [], row_count: 0 } },
          { card_id: 'card-2', state: 'UNCHANGED' },
          { card_id: 'card-3', state: 'RESTRICTED', message: 'Not available.' },
        ],
      },
      {
        cards: [
          {
            card_id: 'card-1',
            targets: [
              { kind: 'FIELD', field_id: 'brands.created_at', semantic_type: 'DATE_PICKER' },
              { kind: 'NATIVE_QUERY_VARIABLE', variable_key: 'date', semantic_type: 'DATE_PICKER' },
            ],
          },
        ],
      },
      { cards: [] },
    ]);
    const service = new CoreApiDashboardRuntimeService(transport);

    await expect(
      service.execute({
        dashboardId: 'dashboard-1',
        tabId: 'tab-1',
        values: { 'filter-1': '2026-09-05' },
        changedFilterIds: ['filter-1'],
      }),
    ).resolves.toMatchObject({
      cards: [
        { cardId: 'card-1', state: 'SUCCESS' },
        { cardId: 'card-2', state: 'UNCHANGED' },
        { cardId: 'card-3', state: 'RESTRICTED', message: 'Not available.' },
      ],
    });
    await expect(service.listFilterTargets({ dashboardId: 'dashboard-1' })).resolves.toEqual([
      {
        cardId: 'card-1',
        targets: [
          { kind: 'FIELD', fieldId: 'brands.created_at', semanticType: 'DATE_PICKER' },
          { kind: 'NATIVE_QUERY_VARIABLE', variableKey: 'date', semanticType: 'DATE_PICKER' },
        ],
      },
    ]);
    await expect(
      service.listFilterTargets({
        dashboardId: 'dashboard-1',
        chartCards: [{ cardId: 'draft-card', chartId: 'chart-2' }],
      }),
    ).resolves.toEqual([]);

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/dashboards/dashboard-1/execute',
      '/dashboards/dashboard-1/filter-targets',
      '/dashboards/dashboard-1/filter-targets/preview',
    ]);
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      tab_id: 'tab-1',
      values: { 'filter-1': '2026-09-05' },
      changed_filter_ids: ['filter-1'],
    });
    expect(JSON.parse(String(transport.requests[2]?.init?.body))).toEqual({
      cards: [{ card_id: 'draft-card', chart_id: 'chart-2' }],
    });
  });
});
