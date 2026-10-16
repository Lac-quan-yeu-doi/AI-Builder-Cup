import type { ListDeviceConfigurationTemplatesUseCase } from '@/src/application/use-cases/devices/list-device-configuration-templates.use-case';
import { presentDeviceConfigurationTemplate } from '@/src/interface-adapters/presenters/device-configuration.presenter';

export type ListDeviceConfigurationTemplatesController = ReturnType<
  typeof createListDeviceConfigurationTemplatesController
>;

export const createListDeviceConfigurationTemplatesController =
  (useCase: ListDeviceConfigurationTemplatesUseCase) => async () =>
    (await useCase()).map(presentDeviceConfigurationTemplate);
