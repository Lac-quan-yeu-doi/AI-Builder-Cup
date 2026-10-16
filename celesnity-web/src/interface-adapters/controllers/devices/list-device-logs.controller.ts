import type { ListDeviceLogsUseCase } from '@/src/application/use-cases/devices/list-device-logs.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDeviceLog } from '@/src/interface-adapters/presenters/device-log.presenter';

import { deviceIdSchema } from './device.schemas';

export type ListDeviceLogsController = ReturnType<typeof createListDeviceLogsController>;

export const createListDeviceLogsController =
  (useCase: ListDeviceLogsUseCase) => async (deviceId: string) => {
    const parsed = deviceIdSchema.safeParse(deviceId);
    if (!parsed.success) throw new InputParseError('Invalid device id', { cause: parsed.error });
    return (await useCase(parsed.data)).map(presentDeviceLog);
  };
