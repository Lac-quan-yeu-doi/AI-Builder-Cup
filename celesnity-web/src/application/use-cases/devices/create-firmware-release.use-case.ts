import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { CreateFirmwareReleaseInput } from '@/src/entities/models/device';

export type CreateFirmwareReleaseUseCase = ReturnType<typeof createCreateFirmwareReleaseUseCase>;

export const createCreateFirmwareReleaseUseCase =
  (repository: DeviceRepository) => (input: CreateFirmwareReleaseInput) =>
    repository.createFirmwareRelease(input);
