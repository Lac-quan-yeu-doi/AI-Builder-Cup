import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListDeviceAdaptersUseCase = ReturnType<typeof createListDeviceAdaptersUseCase>;

export const createListDeviceAdaptersUseCase = (repository: DeviceRepository) => () =>
  repository.listAdapters();
