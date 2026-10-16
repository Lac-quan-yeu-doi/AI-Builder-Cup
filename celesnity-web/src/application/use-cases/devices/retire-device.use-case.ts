import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type RetireDeviceUseCase = ReturnType<typeof createRetireDeviceUseCase>;
export const createRetireDeviceUseCase = (repository: DeviceRepository) => (id: string) =>
  repository.retire(id);
