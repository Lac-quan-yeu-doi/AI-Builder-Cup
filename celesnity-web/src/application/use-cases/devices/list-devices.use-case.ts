import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListDevicesUseCase = ReturnType<typeof createListDevicesUseCase>;

export const createListDevicesUseCase = (repository: DeviceRepository) => (adapterId: string) =>
  repository.list(adapterId);
