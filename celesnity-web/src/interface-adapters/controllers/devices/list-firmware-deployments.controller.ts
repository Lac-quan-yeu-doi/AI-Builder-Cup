import type { ListFirmwareDeploymentsUseCase } from '@/src/application/use-cases/devices/list-firmware-deployments.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentFirmwareDeployment } from '@/src/interface-adapters/presenters/firmware.presenter';

import { deviceIdSchema } from './device.schemas';

export type ListFirmwareDeploymentsController = ReturnType<
  typeof createListFirmwareDeploymentsController
>;

export const createListFirmwareDeploymentsController =
  (useCase: ListFirmwareDeploymentsUseCase) => async (deviceId: string) => {
    const parsed = deviceIdSchema.safeParse(deviceId);
    if (!parsed.success) throw new InputParseError('Invalid device id', { cause: parsed.error });
    return (await useCase(parsed.data)).map(presentFirmwareDeployment);
  };
