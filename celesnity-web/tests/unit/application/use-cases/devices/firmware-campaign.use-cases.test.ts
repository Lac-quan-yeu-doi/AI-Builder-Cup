import { describe, expect, it, vi } from 'vitest';

import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import { createCreateFirmwareCampaignUseCase } from '@/src/application/use-cases/devices/create-firmware-campaign.use-case';
import { createListFirmwareCampaignsUseCase } from '@/src/application/use-cases/devices/list-firmware-campaigns.use-case';
import { createTransitionFirmwareCampaignUseCase } from '@/src/application/use-cases/devices/transition-firmware-campaign.use-case';

describe('firmware campaign use cases', () => {
  it('forward campaign operations through the device repository port', async () => {
    const createFirmwareCampaign = vi.fn().mockResolvedValue({ id: 'campaign-1' });
    const listFirmwareCampaigns = vi.fn().mockResolvedValue([{ id: 'campaign-1' }]);
    const transitionFirmwareCampaign = vi.fn().mockResolvedValue({
      id: 'campaign-1',
      status: 'RUNNING',
    });
    const repository = {
      createFirmwareCampaign,
      listFirmwareCampaigns,
      transitionFirmwareCampaign,
    } as unknown as DeviceRepository;
    const input = {
      name: 'Factory rollout',
      releaseId: '44444444-4444-4444-8444-444444444444',
      deviceIds: ['11111111-1111-4111-8111-111111111111'],
      canarySize: 1,
      batchSize: 10,
    };

    await createCreateFirmwareCampaignUseCase(repository)(input);
    await createListFirmwareCampaignsUseCase(repository)();
    await createTransitionFirmwareCampaignUseCase(repository)({
      id: '77777777-7777-4777-8777-777777777777',
      action: 'start',
    });

    expect(createFirmwareCampaign).toHaveBeenCalledWith(input);
    expect(listFirmwareCampaigns).toHaveBeenCalledOnce();
    expect(transitionFirmwareCampaign).toHaveBeenCalledWith(
      '77777777-7777-4777-8777-777777777777',
      'start',
    );
  });
});
