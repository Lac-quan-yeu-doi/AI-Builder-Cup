import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { RegisterDeviceInput } from '@/src/entities/models/device';

export type RegisterDeviceUseCase = ReturnType<typeof createRegisterDeviceUseCase>;

export const createRegisterDeviceUseCase =
  (repository: DeviceRepository) => (input: RegisterDeviceInput) =>
    repository.register(input);
