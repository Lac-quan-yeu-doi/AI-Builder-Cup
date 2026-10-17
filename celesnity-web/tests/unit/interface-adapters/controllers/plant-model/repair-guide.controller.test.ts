import { describe, expect, it, vi } from 'vitest';

import type { RepairGuideUseCases } from '@/src/application/use-cases/plant-model/repair-guide.use-cases';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { createRepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

const useCases = () =>
  ({ capture: vi.fn(), recordRun: vi.fn(), verifyStep: vi.fn() }) as unknown as RepairGuideUseCases;
const input = { siteId: 'site-1', machineName: 'Washer W1', faultName: 'Belt', expert: 'Tuấn' };

describe('repair guide controller', () => {
  it('needs a video and names for the machine, fault and expert', () => {
    const controller = createRepairGuideController(useCases());
    const video = new File(['x'], 'belt.mp4', { type: 'video/mp4' });
    expect(() => controller.capture(input, 'belt.mp4')).toThrow(InputParseError);
    expect(() => controller.capture({ ...input, expert: '' }, video)).toThrow(InputParseError);
  });

  it('passes the video file and its name through', () => {
    const cases = useCases();
    const video = new File(['x'], 'belt.mp4', { type: 'video/mp4' });
    void createRepairGuideController(cases).capture(input, video);
    expect(cases.capture).toHaveBeenCalledWith(
      expect.objectContaining({ machineName: 'Washer W1', video, fileName: 'belt.mp4' }),
      undefined,
    );
  });

  it('rejects a run with an unknown outcome and a photo that is not an image', () => {
    const controller = createRepairGuideController(useCases());
    expect(() =>
      controller.recordRun('guide-1', {
        id: 'r',
        worker: 'Minh',
        startedAt: '2026-10-17T02:00:00.000Z',
        finishedAt: '2026-10-17T02:10:00.000Z',
        outcome: 'maybe',
        steps: [],
      }),
    ).toThrow(InputParseError);
    expect(() =>
      controller.verifyStep('guide-1', 0, new Blob(['x'], { type: 'text/plain' })),
    ).toThrow(InputParseError);
  });
});
