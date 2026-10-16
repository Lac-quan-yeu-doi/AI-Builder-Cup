import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListDeviceLifecycleUseCase = ReturnType<typeof createListDeviceLifecycleUseCase>;
export const createListDeviceLifecycleUseCase = (repository: DeviceRepository) => (id: string) =>
  repository.listLifecycleTransitions(id);
