import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { ReplaceDeviceInput } from '@/src/entities/models/device';

export type ReplaceDeviceUseCase = ReturnType<typeof createReplaceDeviceUseCase>;
export const createReplaceDeviceUseCase =
  (repository: DeviceRepository) => (input: ReplaceDeviceInput) =>
    repository.replace(input);
