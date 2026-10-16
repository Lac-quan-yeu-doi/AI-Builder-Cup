import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type AcknowledgeDeviceAlertUseCase = ReturnType<typeof createAcknowledgeDeviceAlertUseCase>;

export const createAcknowledgeDeviceAlertUseCase = (repository: DeviceRepository) => (id: string) =>
  repository.acknowledgeAlert(id);
