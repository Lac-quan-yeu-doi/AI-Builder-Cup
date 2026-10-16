import type { ListDeviceAlertsUseCase } from '@/src/application/use-cases/devices/list-device-alerts.use-case';
import { presentDeviceAlert } from '@/src/interface-adapters/presenters/device-alert.presenter';

export type ListDeviceAlertsController = ReturnType<typeof createListDeviceAlertsController>;

export const createListDeviceAlertsController = (useCase: ListDeviceAlertsUseCase) => async () =>
  (await useCase()).map(presentDeviceAlert);
