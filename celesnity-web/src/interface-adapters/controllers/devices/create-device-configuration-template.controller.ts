import type { CreateDeviceConfigurationTemplateUseCase } from '@/src/application/use-cases/devices/create-device-configuration-template.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDeviceConfigurationTemplate } from '@/src/interface-adapters/presenters/device-configuration.presenter';

import { createDeviceConfigurationTemplateInputSchema } from './device.schemas';

export type CreateDeviceConfigurationTemplateController = ReturnType<
  typeof createCreateDeviceConfigurationTemplateController
>;

export const createCreateDeviceConfigurationTemplateController =
  (useCase: CreateDeviceConfigurationTemplateUseCase) => async (input: unknown) => {
    const parsed = createDeviceConfigurationTemplateInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid configuration template input', { cause: parsed.error });
    }
    return presentDeviceConfigurationTemplate(await useCase(parsed.data));
  };
