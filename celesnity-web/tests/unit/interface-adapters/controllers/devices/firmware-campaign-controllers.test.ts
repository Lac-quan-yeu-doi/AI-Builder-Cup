import { describe, expect, it, vi } from 'vitest';

import type { FirmwareCampaign } from '@/src/entities/models/device';
import { createCreateFirmwareCampaignController } from '@/src/interface-adapters/controllers/devices/create-firmware-campaign.controller';
import { createListFirmwareCampaignsController } from '@/src/interface-adapters/controllers/devices/list-firmware-campaigns.controller';
import { createTransitionFirmwareCampaignController } from '@/src/interface-adapters/controllers/devices/transition-firmware-campaign.controller';

const campaign: FirmwareCampaign = {
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Factory rollout',
  releaseId: '44444444-4444-4444-8444-444444444444',
  releaseVersion: '1.2.0',
  status: 'DRAFT',
  canarySize: 1,
  batchSize: 10,
  requestedBy: 'owner-1',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
  targets: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      deviceId: '11111111-1111-4111-8111-111111111111',
      deviceName: 'Sensor 1',
      batchNumber: 0,
      status: 'PENDING',
      progressPercent: 0,
      updatedAt: '2026-09-06T00:00:00.000Z',
    },
  ],
};

describe('firmware campaign controllers', () => {
  it('validates creation and returns a detached campaign view model', async () => {
    const useCase = vi.fn().mockResolvedValue(campaign);
    const controller = createCreateFirmwareCampaignController(useCase);
    const input = {
      name: campaign.name,
      releaseId: campaign.releaseId,
      deviceIds: [campaign.targets[0]?.deviceId ?? ''],
      canarySize: 1,
      batchSize: 10,
    };

    const result = await controller(input);

    expect(useCase).toHaveBeenCalledWith(input);
    expect(result).not.toBe(campaign);
    expect(result.targets).not.toBe(campaign.targets);
  });

  it('lists campaigns and validates transition actions', async () => {
    const list = createListFirmwareCampaignsController(vi.fn().mockResolvedValue([campaign]));
    const transitionUseCase = vi.fn().mockResolvedValue({ ...campaign, status: 'RUNNING' });
    const transition = createTransitionFirmwareCampaignController(transitionUseCase);

    expect(await list()).toHaveLength(1);
    await transition({ id: campaign.id, action: 'start' });
    await expect(
      transition({ id: campaign.id, action: 'delete' as 'start' }),
    ).rejects.toMatchObject({ name: 'InputParseError' });
    expect(transitionUseCase).toHaveBeenCalledOnce();
  });
});
