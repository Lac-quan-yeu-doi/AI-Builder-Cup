import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListFirmwareReleasesUseCase = ReturnType<typeof createListFirmwareReleasesUseCase>;

export const createListFirmwareReleasesUseCase = (repository: DeviceRepository) => () =>
  repository.listFirmwareReleases();
