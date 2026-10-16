import type { RegisterDeviceUseCase } from '@/src/application/use-cases/devices/register-device.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { RegisterDeviceInput } from '@/src/entities/models/device';
import { presentDeviceRegistration } from '@/src/interface-adapters/presenters/device.presenter';

import { registerDeviceInputSchema } from './device.schemas';

export type RegisterDeviceController = ReturnType<typeof createRegisterDeviceController>;
export const createRegisterDeviceController =
  (useCase: RegisterDeviceUseCase) => async (input: RegisterDeviceInput) => {
    const parsed = registerDeviceInputSchema.safeParse(input);
    if (!parsed.success) throw new InputParseError('Invalid device input', { cause: parsed.error });
    return presentDeviceRegistration(await useCase(parsed.data));
  };
