import type { SuspendDeviceUseCase } from '@/src/application/use-cases/devices/suspend-device.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDevice } from '@/src/interface-adapters/presenters/device.presenter';

import { deviceIdSchema } from './device.schemas';

export type SuspendDeviceController = ReturnType<typeof createSuspendDeviceController>;
export const createSuspendDeviceController =
  (useCase: SuspendDeviceUseCase) => async (id: string) => {
    const parsed = deviceIdSchema.safeParse(id);
    if (!parsed.success) throw new InputParseError('Invalid device id', { cause: parsed.error });
    return presentDevice(await useCase(parsed.data));
  };
