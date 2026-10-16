import type { RotateDeviceCredentialUseCase } from '@/src/application/use-cases/devices/rotate-device-credential.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDeviceRegistration } from '@/src/interface-adapters/presenters/device.presenter';

import { deviceIdSchema } from './device.schemas';

export type RotateDeviceCredentialController = ReturnType<
  typeof createRotateDeviceCredentialController
>;
export const createRotateDeviceCredentialController =
  (useCase: RotateDeviceCredentialUseCase) => async (id: string) => {
    const parsed = deviceIdSchema.safeParse(id);
    if (!parsed.success) throw new InputParseError('Invalid device id', { cause: parsed.error });
    return presentDeviceRegistration(await useCase(parsed.data));
  };
