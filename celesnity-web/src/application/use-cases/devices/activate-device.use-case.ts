import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ActivateDeviceUseCase = ReturnType<typeof createActivateDeviceUseCase>;
export const createActivateDeviceUseCase = (repository: DeviceRepository) => (id: string) =>
  repository.activate(id);
