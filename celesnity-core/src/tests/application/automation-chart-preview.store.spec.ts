import { AutomationChartPreviewStore } from '@application/chart/automation-chart-preview.store';

describe('AutomationChartPreviewStore', () => {
  it('evicts previews from the oldest run when the global run limit is reached', () => {
    const store = new AutomationChartPreviewStore();
    for (let index = 0; index < 257; index += 1) {
      store.remember(`run-${index}`, { title: `Chart ${index}` });
    }

    expect(store.forRun('run-0')).toEqual([]);
    expect(store.forRun('run-256')).toEqual([{ title: 'Chart 256' }]);
  });
});
