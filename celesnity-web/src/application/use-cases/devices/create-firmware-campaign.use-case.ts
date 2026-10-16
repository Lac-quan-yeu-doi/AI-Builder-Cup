import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { CreateFirmwareCampaignInput } from '@/src/entities/models/device';

export type CreateFirmwareCampaignUseCase = ReturnType<typeof createCreateFirmwareCampaignUseCase>;

export const createCreateFirmwareCampaignUseCase =
  (repository: DeviceRepository) => (input: CreateFirmwareCampaignInput) =>
    repository.createFirmwareCampaign(input);
