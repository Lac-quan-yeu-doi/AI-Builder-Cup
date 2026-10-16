import type { ListDeviceLifecycleUseCase } from '@/src/application/use-cases/devices/list-device-lifecycle.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

import { deviceIdSchema } from './device.schemas';

export type ListDeviceLifecycleController = ReturnType<typeof createListDeviceLifecycleController>;
export const createListDeviceLifecycleController =
  (useCase: ListDeviceLifecycleUseCase) => async (id: string) => {
    const parsed = deviceIdSchema.safeParse(id);
    if (!parsed.success) throw new InputParseError('Invalid device id', { cause: parsed.error });
    return useCase(parsed.data).then((transitions) =>
      transitions.map((transition) => ({ ...transition })),
    );
  };
