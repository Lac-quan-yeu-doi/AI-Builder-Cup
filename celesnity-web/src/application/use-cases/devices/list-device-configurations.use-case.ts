import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListDeviceConfigurationsUseCase = ReturnType<
  typeof createListDeviceConfigurationsUseCase
>;

export const createListDeviceConfigurationsUseCase =
  (repository: DeviceRepository) => (deviceId: string) =>
    repository.listConfigurations(deviceId);
