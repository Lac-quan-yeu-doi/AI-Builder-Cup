import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { DeployDeviceConfigurationTemplateInput } from '@/src/entities/models/device';

export type DeployDeviceConfigurationTemplateUseCase = ReturnType<
  typeof createDeployDeviceConfigurationTemplateUseCase
>;

export const createDeployDeviceConfigurationTemplateUseCase =
  (repository: DeviceRepository) => (input: DeployDeviceConfigurationTemplateInput) =>
    repository.deployConfigurationTemplate(input);
