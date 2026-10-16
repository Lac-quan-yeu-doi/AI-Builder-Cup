import type { ListFirmwareReleasesUseCase } from '@/src/application/use-cases/devices/list-firmware-releases.use-case';
import { presentFirmwareRelease } from '@/src/interface-adapters/presenters/firmware.presenter';

export type ListFirmwareReleasesController = ReturnType<
  typeof createListFirmwareReleasesController
>;

export const createListFirmwareReleasesController =
  (useCase: ListFirmwareReleasesUseCase) => async () =>
    (await useCase()).map(presentFirmwareRelease);
