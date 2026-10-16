import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { TransitionFirmwareCampaignInput } from '@/src/entities/models/device';

export type TransitionFirmwareCampaignUseCase = ReturnType<
  typeof createTransitionFirmwareCampaignUseCase
>;

export const createTransitionFirmwareCampaignUseCase =
  (repository: DeviceRepository) => (input: TransitionFirmwareCampaignInput) =>
    repository.transitionFirmwareCampaign(input.id, input.action);
