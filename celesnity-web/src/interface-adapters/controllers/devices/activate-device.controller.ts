import type { ActivateDeviceUseCase } from '@/src/application/use-cases/devices/activate-device.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDevice } from '@/src/interface-adapters/presenters/device.presenter';

import { deviceIdSchema } from './device.schemas';

export type ActivateDeviceController = ReturnType<typeof createActivateDeviceController>;
export const createActivateDeviceController =
  (useCase: ActivateDeviceUseCase) => async (id: string) => {
    const parsed = deviceIdSchema.safeParse(id);
    if (!parsed.success) throw new InputParseError('Invalid device id', { cause: parsed.error });
    return presentDevice(await useCase(parsed.data));
  };
