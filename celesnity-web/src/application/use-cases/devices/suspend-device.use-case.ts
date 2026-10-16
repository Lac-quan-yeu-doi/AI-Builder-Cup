import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type SuspendDeviceUseCase = ReturnType<typeof createSuspendDeviceUseCase>;
export const createSuspendDeviceUseCase = (repository: DeviceRepository) => (id: string) =>
  repository.suspend(id);
