import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { TransitionDeviceLifecycleInput } from '@/src/entities/models/device';

export type TransitionDeviceLifecycleUseCase = ReturnType<
  typeof createTransitionDeviceLifecycleUseCase
>;
export const createTransitionDeviceLifecycleUseCase =
  (repository: DeviceRepository) => (input: TransitionDeviceLifecycleInput) =>
    repository.transitionLifecycle(input);
