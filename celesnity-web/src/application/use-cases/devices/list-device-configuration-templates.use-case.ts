import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListDeviceConfigurationTemplatesUseCase = ReturnType<
  typeof createListDeviceConfigurationTemplatesUseCase
>;

export const createListDeviceConfigurationTemplatesUseCase = (repository: DeviceRepository) => () =>
  repository.listConfigurationTemplates();
