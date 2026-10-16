import type { ListDeviceConfigurationsUseCase } from '@/src/application/use-cases/devices/list-device-configurations.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDeviceConfiguration } from '@/src/interface-adapters/presenters/device-configuration.presenter';

import { deviceIdSchema } from './device.schemas';

export type ListDeviceConfigurationsController = ReturnType<
  typeof createListDeviceConfigurationsController
>;

export const createListDeviceConfigurationsController =
  (useCase: ListDeviceConfigurationsUseCase) => async (deviceId: string) => {
    const parsed = deviceIdSchema.safeParse(deviceId);
    if (!parsed.success) throw new InputParseError('Invalid device id', { cause: parsed.error });
    return (await useCase(parsed.data)).map(presentDeviceConfiguration);
  };
