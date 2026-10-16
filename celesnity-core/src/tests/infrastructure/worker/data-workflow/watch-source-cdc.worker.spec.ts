import { WatchSourceCdcWorker } from '@infrastructure/worker/data-workflow/watch-source-cdc.worker';

describe('WatchSourceCdcWorker', () => {
  afterEach(() => jest.useRealTimers());

  it('does not overlap a sealing tick', async () => {
    let release: (() => void) | undefined;
    const service = {
      sealDueWindows: jest.fn(
        () =>
          new Promise<{ windows: readonly unknown[] }>((resolve) => {
            release = () => resolve({ windows: [] });
          }),
      ),
    };
    const worker = new WatchSourceCdcWorker(service as never, { pollIntervalMs: 60_000 });

    const first = worker.tick();
    await expect(worker.tick()).resolves.toBe(0);
    expect(service.sealDueWindows).toHaveBeenCalledTimes(1);
    release?.();
    await expect(first).resolves.toBe(0);
  });
});
