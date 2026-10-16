import type { RetireDeviceUseCase } from '@/src/application/use-cases/devices/retire-device.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

import { deviceIdSchema } from './device.schemas';

export type RetireDeviceController = ReturnType<typeof createRetireDeviceController>;
export const createRetireDeviceController =
  (useCase: RetireDeviceUseCase) => async (id: string) => {
    const parsed = deviceIdSchema.safeParse(id);
    if (!parsed.success) throw new InputParseError('Invalid device id', { cause: parsed.error });
    await useCase(parsed.data);
  };
