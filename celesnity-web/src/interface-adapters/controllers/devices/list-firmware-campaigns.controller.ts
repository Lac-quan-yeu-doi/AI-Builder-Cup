import type { ListFirmwareCampaignsUseCase } from '@/src/application/use-cases/devices/list-firmware-campaigns.use-case';
import { presentFirmwareCampaign } from '@/src/interface-adapters/presenters/firmware.presenter';

export type ListFirmwareCampaignsController = ReturnType<
  typeof createListFirmwareCampaignsController
>;

export const createListFirmwareCampaignsController =
  (useCase: ListFirmwareCampaignsUseCase) => async () =>
    (await useCase()).map(presentFirmwareCampaign);
