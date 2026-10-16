import { SealCdcWindowsService } from '@application/data-workflow-watch-source/seal-cdc-windows.service';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import { FixedClock } from '@tests/support/deterministic-ports';

describe('SealCdcWindowsService', () => {
  it('seals with the configured batch size and injected clock', async () => {
    const now = new Date('2026-09-18T09:02:00.000Z');
    const repository = {
      sealDueCdcWindows: jest.fn().mockResolvedValue({
        windows: [],
        notificationCount: 0,
        assignmentCount: 0,
      }),
    } as unknown as IWatchSourceRepository;
    const service = new SealCdcWindowsService(repository, new FixedClock(now), { batchSize: 17 });

    await expect(service.sealDueWindows()).resolves.toEqual({
      windows: [],
      notificationCount: 0,
      assignmentCount: 0,
    });
    expect(repository.sealDueCdcWindows).toHaveBeenCalledWith(now, 17);
  });
});
