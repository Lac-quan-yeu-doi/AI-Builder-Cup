import type { DeployDeviceConfigurationTemplateUseCase } from '@/src/application/use-cases/devices/deploy-device-configuration-template.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDeviceConfigurationTemplateDeployment } from '@/src/interface-adapters/presenters/device-configuration.presenter';

import { deployDeviceConfigurationTemplateInputSchema } from './device.schemas';

export type DeployDeviceConfigurationTemplateController = ReturnType<
  typeof createDeployDeviceConfigurationTemplateController
>;

export const createDeployDeviceConfigurationTemplateController =
  (useCase: DeployDeviceConfigurationTemplateUseCase) => async (input: unknown) => {
    const parsed = deployDeviceConfigurationTemplateInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid configuration template target', { cause: parsed.error });
    }
    return presentDeviceConfigurationTemplateDeployment(await useCase(parsed.data));
  };
