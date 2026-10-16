import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { CreateDeviceConfigurationTemplateInput } from '@/src/entities/models/device';

export type CreateDeviceConfigurationTemplateUseCase = ReturnType<
  typeof createCreateDeviceConfigurationTemplateUseCase
>;

export const createCreateDeviceConfigurationTemplateUseCase =
  (repository: DeviceRepository) => (input: CreateDeviceConfigurationTemplateInput) =>
    repository.createConfigurationTemplate(input);
