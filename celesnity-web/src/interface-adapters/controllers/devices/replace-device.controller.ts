import type { ReplaceDeviceUseCase } from '@/src/application/use-cases/devices/replace-device.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { ReplaceDeviceInput } from '@/src/entities/models/device';
import { presentDeviceRegistration } from '@/src/interface-adapters/presenters/device.presenter';

import { replaceDeviceInputSchema } from './device.schemas';

export type ReplaceDeviceController = ReturnType<typeof createReplaceDeviceController>;
export const createReplaceDeviceController =
  (useCase: ReplaceDeviceUseCase) => async (input: ReplaceDeviceInput) => {
    const parsed = replaceDeviceInputSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid replacement device', { cause: parsed.error });
    return presentDeviceRegistration(await useCase(parsed.data));
  };
