import type { TransitionFirmwareCampaignUseCase } from '@/src/application/use-cases/devices/transition-firmware-campaign.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { TransitionFirmwareCampaignInput } from '@/src/entities/models/device';
import { presentFirmwareCampaign } from '@/src/interface-adapters/presenters/firmware.presenter';

import { transitionFirmwareCampaignInputSchema } from './device.schemas';

export type TransitionFirmwareCampaignController = ReturnType<
  typeof createTransitionFirmwareCampaignController
>;

export const createTransitionFirmwareCampaignController =
  (useCase: TransitionFirmwareCampaignUseCase) =>
  async (input: TransitionFirmwareCampaignInput) => {
    const parsed = transitionFirmwareCampaignInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid firmware campaign transition', { cause: parsed.error });
    }
    return presentFirmwareCampaign(await useCase(parsed.data));
  };
