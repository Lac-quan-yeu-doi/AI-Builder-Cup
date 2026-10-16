import { describe, expect, it } from 'vitest';

import {
  createDashboardRuntimeState,
  dashboardRuntimeReducer,
} from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-runtime-state';

describe('dashboard runtime state', () => {
  it('retains unchanged card results during selective filter execution', () => {
    let state = createDashboardRuntimeState(['card-1', 'card-2']);
    state = dashboardRuntimeReducer(state, {
      type: 'resolved',
      cards: [
        { cardId: 'card-1', state: 'SUCCESS', result: result('old') },
        { cardId: 'card-2', state: 'SUCCESS', result: result('stable') },
      ],
    });
    state = dashboardRuntimeReducer(state, { type: 'started', cardIds: ['card-1'] });
    state = dashboardRuntimeReducer(state, {
      type: 'resolved',
      cards: [
        { cardId: 'card-1', state: 'SUCCESS', result: result('new') },
        { cardId: 'card-2', state: 'UNCHANGED' },
      ],
    });

    expect(state.cards['card-1']).toMatchObject({ status: 'SUCCESS', result: { rows: [['new']] } });
    expect(state.cards['card-2']).toMatchObject({
      status: 'SUCCESS',
      result: { rows: [['stable']] },
    });
  });

  it('keeps required-filter and card-local failure states isolated', () => {
    const state = dashboardRuntimeReducer(createDashboardRuntimeState(['card-1', 'card-2']), {
      type: 'resolved',
      cards: [
        { cardId: 'card-1', state: 'REQUIRES_FILTER' },
        { cardId: 'card-2', state: 'ERROR', message: 'Could not run.' },
      ],
    });

    expect(state.cards['card-1']?.status).toBe('REQUIRES_FILTER');
    expect(state.cards['card-2']).toMatchObject({ status: 'ERROR', message: 'Could not run.' });
  });
});

function result(value: string) {
  return {
    runId: `run-${value}`,
    columns: [{ name: 'value', type: 'varchar', family: 'STRING' as const }],
    rows: [[value]],
    rowCount: 1,
  };
}
