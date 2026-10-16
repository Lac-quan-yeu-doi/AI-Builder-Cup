import type { CreateFirmwareCampaignUseCase } from '@/src/application/use-cases/devices/create-firmware-campaign.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { CreateFirmwareCampaignInput } from '@/src/entities/models/device';
import { presentFirmwareCampaign } from '@/src/interface-adapters/presenters/firmware.presenter';

import { createFirmwareCampaignInputSchema } from './device.schemas';

export type CreateFirmwareCampaignController = ReturnType<
  typeof createCreateFirmwareCampaignController
>;

export const createCreateFirmwareCampaignController =
  (useCase: CreateFirmwareCampaignUseCase) => async (input: CreateFirmwareCampaignInput) => {
    const parsed = createFirmwareCampaignInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid firmware campaign input', { cause: parsed.error });
    }
    return presentFirmwareCampaign(await useCase(parsed.data));
  };
