import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ClearDeviceAlertUseCase = ReturnType<typeof createClearDeviceAlertUseCase>;

export const createClearDeviceAlertUseCase = (repository: DeviceRepository) => (id: string) =>
  repository.clearAlert(id);
