import type { CreateFirmwareReleaseUseCase } from '@/src/application/use-cases/devices/create-firmware-release.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { CreateFirmwareReleaseInput } from '@/src/entities/models/device';
import { presentFirmwareRelease } from '@/src/interface-adapters/presenters/firmware.presenter';

import { createFirmwareReleaseInputSchema } from './device.schemas';

export type CreateFirmwareReleaseController = ReturnType<
  typeof createCreateFirmwareReleaseController
>;

export const createCreateFirmwareReleaseController =
  (useCase: CreateFirmwareReleaseUseCase) => async (input: CreateFirmwareReleaseInput) => {
    const parsed = createFirmwareReleaseInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid firmware release input', { cause: parsed.error });
    }
    return presentFirmwareRelease(await useCase(parsed.data));
  };
