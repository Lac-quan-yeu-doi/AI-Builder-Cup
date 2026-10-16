import { ChartRealtimeHub } from '@infrastructure/chart/chart-realtime.hub';
import type { Chart } from '@domain/chart/models/chart';

const chart: Chart = {
  id: 'chart-1',
  runId: null,
  title: 'Sales',
  chartType: 'bar',
  encodings: {},
  data: [{ value: 1 }],
  config: {},
  vlSpec: null,
  sql: null,
  status: 'draft',
  errorMessage: null,
  version: 1,
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
};

describe('ChartRealtimeHub', () => {
  it('fans out updates and replays events after reconnect', () => {
    const hub = new ChartRealtimeHub();
    const live: number[] = [];
    const replayed: number[] = [];

    const unsubscribe = hub.subscribe((event) => live.push(event.sequence));
    hub.publishUpsert(chart);
    unsubscribe();

    hub.subscribe((event) => replayed.push(event.sequence), 0);

    expect(live).toEqual([1]);
    expect(replayed).toEqual([1]);
  });

  it('coalesces duplicate versions so a retry does not amplify fan-out', () => {
    const hub = new ChartRealtimeHub();
    const events: number[] = [];
    hub.subscribe((event) => events.push(event.sequence));

    hub.publishUpsert(chart);
    hub.publishUpsert(chart);
    hub.publishUpsert({ ...chart, version: 2 });

    expect(events).toEqual([1, 2]);
    expect(hub.currentSequence()).toBe(2);
  });
});
