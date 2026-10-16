import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListDeviceAlertsUseCase = ReturnType<typeof createListDeviceAlertsUseCase>;

export const createListDeviceAlertsUseCase = (repository: DeviceRepository) => () =>
  repository.listAlerts();
