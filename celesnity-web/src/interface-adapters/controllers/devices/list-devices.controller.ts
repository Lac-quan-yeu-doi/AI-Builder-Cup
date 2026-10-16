import type { ListDevicesUseCase } from '@/src/application/use-cases/devices/list-devices.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDevice } from '@/src/interface-adapters/presenters/device.presenter';

import { adapterIdSchema } from './device.schemas';

export type ListDevicesController = ReturnType<typeof createListDevicesController>;
export const createListDevicesController =
  (useCase: ListDevicesUseCase) => async (adapterId: string) => {
    const parsed = adapterIdSchema.safeParse(adapterId);
    if (!parsed.success) throw new InputParseError('Invalid adapter id', { cause: parsed.error });
    return (await useCase(parsed.data)).map(presentDevice);
  };
