import type {
  FirmwareCampaign,
  FirmwareDeployment,
  FirmwareRelease,
} from '@/src/entities/models/device';

export type FirmwareReleaseViewModel = FirmwareRelease;
export type FirmwareDeploymentViewModel = FirmwareDeployment;
export type FirmwareCampaignViewModel = FirmwareCampaign;

export const presentFirmwareRelease = (release: FirmwareRelease): FirmwareReleaseViewModel => ({
  ...release,
});

export const presentFirmwareDeployment = (
  deployment: FirmwareDeployment,
): FirmwareDeploymentViewModel => ({ ...deployment });

export const presentFirmwareCampaign = (campaign: FirmwareCampaign): FirmwareCampaignViewModel => ({
  ...campaign,
  targets: campaign.targets.map((target) => ({ ...target })),
});
