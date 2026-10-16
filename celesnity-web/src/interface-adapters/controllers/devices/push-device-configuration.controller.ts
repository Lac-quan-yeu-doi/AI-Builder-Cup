import type { PushDeviceConfigurationUseCase } from '@/src/application/use-cases/devices/push-device-configuration.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDeviceConfiguration } from '@/src/interface-adapters/presenters/device-configuration.presenter';

import { pushDeviceConfigurationInputSchema } from './device.schemas';

export type PushDeviceConfigurationController = ReturnType<
  typeof createPushDeviceConfigurationController
>;

export const createPushDeviceConfigurationController =
  (useCase: PushDeviceConfigurationUseCase) => async (input: unknown) => {
    const parsed = pushDeviceConfigurationInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid device configuration input', { cause: parsed.error });
    }
    return presentDeviceConfiguration(await useCase(parsed.data));
  };
