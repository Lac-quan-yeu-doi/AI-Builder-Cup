import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListFirmwareCampaignsUseCase = ReturnType<typeof createListFirmwareCampaignsUseCase>;

export const createListFirmwareCampaignsUseCase = (repository: DeviceRepository) => () =>
  repository.listFirmwareCampaigns();
