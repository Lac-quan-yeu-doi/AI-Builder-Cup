import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { PushDeviceConfigurationInput } from '@/src/entities/models/device';

export type PushDeviceConfigurationUseCase = ReturnType<
  typeof createPushDeviceConfigurationUseCase
>;

export const createPushDeviceConfigurationUseCase =
  (repository: DeviceRepository) => (input: PushDeviceConfigurationInput) =>
    repository.pushConfiguration(input);
