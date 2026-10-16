import type { StartFirmwareDeploymentUseCase } from '@/src/application/use-cases/devices/start-firmware-deployment.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentFirmwareDeployment } from '@/src/interface-adapters/presenters/firmware.presenter';

import { startFirmwareDeploymentInputSchema } from './device.schemas';

export type StartFirmwareDeploymentController = ReturnType<
  typeof createStartFirmwareDeploymentController
>;

export const createStartFirmwareDeploymentController =
  (useCase: StartFirmwareDeploymentUseCase) => async (input: unknown) => {
    const parsed = startFirmwareDeploymentInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid firmware deployment input', { cause: parsed.error });
    }
    return presentFirmwareDeployment(await useCase(parsed.data));
  };
