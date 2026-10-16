import type { ListDeviceAdaptersUseCase } from '@/src/application/use-cases/devices/list-device-adapters.use-case';

export type ListDeviceAdaptersController = ReturnType<typeof createListDeviceAdaptersController>;
export const createListDeviceAdaptersController = (useCase: ListDeviceAdaptersUseCase) => () =>
  useCase();
