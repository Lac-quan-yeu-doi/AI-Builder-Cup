import type { AcknowledgeDeviceAlertUseCase } from '@/src/application/use-cases/devices/acknowledge-device-alert.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDeviceAlert } from '@/src/interface-adapters/presenters/device-alert.presenter';

import { deviceIdSchema } from './device.schemas';

export type AcknowledgeDeviceAlertController = ReturnType<
  typeof createAcknowledgeDeviceAlertController
>;

export const createAcknowledgeDeviceAlertController =
  (useCase: AcknowledgeDeviceAlertUseCase) => async (id: string) => {
    const parsed = deviceIdSchema.safeParse(id);
    if (!parsed.success) throw new InputParseError('Invalid alert id', { cause: parsed.error });
    return presentDeviceAlert(await useCase(parsed.data));
  };
