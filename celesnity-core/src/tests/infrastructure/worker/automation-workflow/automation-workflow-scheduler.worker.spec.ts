import { AutomationWorkflowSchedulerWorker } from '@infrastructure/worker/automation-workflow/automation-workflow-scheduler.worker';
import type { AutomationWorkflowSchedulerService } from '@application/automation-workflow/automation-workflow-scheduler.service';

describe('AutomationWorkflowSchedulerWorker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('ticks the scheduler on bootstrap', async () => {
    const tick = jest.fn(async () => 0);
    const scheduler = { tick } as unknown as AutomationWorkflowSchedulerService;
    const worker = new AutomationWorkflowSchedulerWorker(scheduler, { pollIntervalMs: 1000 });

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);

    expect(tick).toHaveBeenCalledTimes(1);
    worker.onApplicationShutdown();
  });

  it('re-ticks on the poll interval until shut down', async () => {
    const tick = jest.fn(async () => 0);
    const scheduler = { tick } as unknown as AutomationWorkflowSchedulerService;
    const worker = new AutomationWorkflowSchedulerWorker(scheduler, { pollIntervalMs: 1000 });

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1000);

    expect(tick).toHaveBeenCalledTimes(2);
    worker.onApplicationShutdown();
  });

  it('stops ticking after shutdown', async () => {
    const tick = jest.fn(async () => 0);
    const scheduler = { tick } as unknown as AutomationWorkflowSchedulerService;
    const worker = new AutomationWorkflowSchedulerWorker(scheduler, { pollIntervalMs: 1000 });

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    worker.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(5000);

    expect(tick).toHaveBeenCalledTimes(1);
  });
});
