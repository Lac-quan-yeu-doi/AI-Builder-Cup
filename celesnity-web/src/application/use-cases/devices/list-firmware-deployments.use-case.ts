import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListFirmwareDeploymentsUseCase = ReturnType<
  typeof createListFirmwareDeploymentsUseCase
>;

export const createListFirmwareDeploymentsUseCase =
  (repository: DeviceRepository) => (deviceId: string) =>
    repository.listFirmwareDeployments(deviceId);
