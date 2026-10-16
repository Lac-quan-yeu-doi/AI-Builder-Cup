import type {
  FirmwareCampaign,
  FirmwareCampaignRecord,
  FirmwareCampaignStatus,
} from '@domain/device-management/models/firmware';

export interface IFirmwareCampaignRepository {
  createCampaign(campaign: FirmwareCampaignRecord): Promise<FirmwareCampaign | 'NAME_CONFLICT'>;
  listCampaigns(): Promise<readonly FirmwareCampaign[]>;
  findCampaign(id: string): Promise<FirmwareCampaign | undefined>;
  transitionCampaign(
    id: string,
    expectedStatus: FirmwareCampaignStatus,
    expectedCurrentBatch: number | null,
    status: FirmwareCampaignStatus,
    currentBatch: number | undefined,
    updatedAt: string,
    error?: string,
  ): Promise<FirmwareCampaign | undefined>;
  linkCampaignDeployment(targetId: string, deploymentId: string, updatedAt: string): Promise<void>;
  cancelPendingCampaignTargets(campaignId: string, updatedAt: string): Promise<void>;
}
