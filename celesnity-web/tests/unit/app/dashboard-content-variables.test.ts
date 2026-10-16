import { describe, expect, it } from 'vitest';

import { renderDashboardContentVariables } from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-content-variables';

describe('renderDashboardContentVariables', () => {
  it('renders only explicitly mapped variables for the target card', () => {
    const mappings = [
      {
        filterId: 'filter-1',
        cardId: 'heading-1',
        target: { kind: 'CONTENT_VARIABLE' as const, variableName: 'region' },
      },
    ];
    expect(
      renderDashboardContentVariables('Sales in {{region}} / {{unmapped}}', 'heading-1', mappings, {
        'filter-1': 'South',
      }),
    ).toBe('Sales in South / {{unmapped}}');
    expect(
      renderDashboardContentVariables(
        'https://example.test/{{region}}',
        'heading-1',
        mappings,
        { 'filter-1': 'South East' },
        true,
      ),
    ).toBe('https://example.test/South%20East');
  });
});
