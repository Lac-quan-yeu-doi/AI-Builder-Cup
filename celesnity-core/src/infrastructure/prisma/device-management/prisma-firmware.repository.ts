import { Injectable } from '@nestjs/common';
import type { Prisma } from '@generated/prisma/client';

import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import type { IFirmwareCampaignRepository } from '@application/device-management/interfaces/i-firmware-campaign.repository';
import type {
  FirmwareCampaign,
  FirmwareCampaignRecord,
  FirmwareCampaignStatus,
  FirmwareCampaignTarget,
  FirmwareDeployment,
  FirmwareDeploymentRecord,
  FirmwareDeploymentStatus,
  FirmwareRelease,
} from '@domain/device-management/models/firmware';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const RELEASE_SELECTION = {
  id: true,
  organizationId: true,
  version: true,
  deviceModel: true,
  hardwareRevision: true,
  artifactUrl: true,
  artifactStorageProvider: true,
  artifactBucket: true,
  artifactObjectKey: true,
  artifactFileName: true,
  artifactContentType: true,
  artifactSizeBytes: true,
  sha256: true,
  signature: true,
  signingKeyId: true,
  signaturePayload: true,
  signatureVerifiedAt: true,
  releaseNotes: true,
  createdBy: true,
  createdAt: true,
} as const;

const DEPLOYMENT_SELECTION = {
  id: true,
  organizationId: true,
  deviceId: true,
  releaseId: true,
  releaseVersion: true,
  status: true,
  progressPercent: true,
  previousVersion: true,
  error: true,
  eventTokenHash: true,
  requestedBy: true,
  requestedAt: true,
  startedAt: true,
  finishedAt: true,
  updatedAt: true,
} as const;

const CAMPAIGN_SELECTION = {
  id: true,
  organizationId: true,
  name: true,
  releaseId: true,
  releaseVersion: true,
  status: true,
  canarySize: true,
  batchSize: true,
  currentBatch: true,
  requestedBy: true,
  error: true,
  createdAt: true,
  updatedAt: true,
  targets: {
    select: {
      id: true,
      deviceId: true,
      batchNumber: true,
      deploymentId: true,
      cancelledAt: true,
      updatedAt: true,
      device: { select: { name: true } },
      deployment: {
        select: { status: true, progressPercent: true, error: true, updatedAt: true },
      },
    },
    orderBy: [{ batchNumber: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.FirmwareCampaignSelect;

type ReleaseRow = Prisma.FirmwareReleaseGetPayload<{ select: typeof RELEASE_SELECTION }>;
type DeploymentRow = Prisma.FirmwareDeploymentGetPayload<{ select: typeof DEPLOYMENT_SELECTION }>;
type CampaignRow = Prisma.FirmwareCampaignGetPayload<{ select: typeof CAMPAIGN_SELECTION }>;

@Injectable()
export class PrismaFirmwareRepository implements IFirmwareRepository, IFirmwareCampaignRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createRelease(
    release: FirmwareRelease,
  ): Promise<FirmwareRelease | 'VERSION_CONFLICT'> {
    try {
      const row = await this.prisma.client.firmwareRelease.create({
        data: {
          id: release.id,
          organizationId: release.organizationId,
          version: release.version,
          deviceModel: release.deviceModel,
          hardwareRevision: release.hardwareRevision,
          artifactUrl: release.artifactUrl,
          artifactStorageProvider: release.artifactStorageProvider,
          artifactBucket: release.artifactBucket,
          artifactObjectKey: release.artifactObjectKey,
          artifactFileName: release.artifactFileName,
          artifactContentType: release.artifactContentType,
          artifactSizeBytes: release.artifactSizeBytes,
          sha256: release.sha256,
          signature: release.signature,
          signingKeyId: release.signingKeyId,
          signaturePayload: release.signaturePayload,
          signatureVerifiedAt:
            release.signatureVerifiedAt === undefined
              ? undefined
              : new Date(release.signatureVerifiedAt),
          releaseNotes: release.releaseNotes,
          createdBy: release.createdBy,
          createdAt: new Date(release.createdAt),
        },
        select: RELEASE_SELECTION,
      });
      return toRelease(row);
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) return 'VERSION_CONFLICT';
      throw error;
    }
  }

  public async listReleases(): Promise<readonly FirmwareRelease[]> {
    const rows = await this.prisma.client.firmwareRelease.findMany({
      select: RELEASE_SELECTION,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRelease);
  }

  public async findRelease(id: string): Promise<FirmwareRelease | undefined> {
    const row = await this.prisma.client.firmwareRelease.findUnique({
      where: { id },
      select: RELEASE_SELECTION,
    });
    return row === null ? undefined : toRelease(row);
  }

  public async createDeployment(
    deployment: FirmwareDeploymentRecord,
  ): Promise<FirmwareDeployment | 'ACTIVE_DEPLOYMENT_CONFLICT'> {
    try {
      const row = await this.prisma.client.firmwareDeployment.create({
        data: {
          id: deployment.id,
          organizationId: deployment.organizationId,
          deviceId: deployment.deviceId,
          releaseId: deployment.releaseId,
          releaseVersion: deployment.releaseVersion,
          status: deployment.status,
          progressPercent: deployment.progressPercent,
          previousVersion: deployment.previousVersion,
          eventTokenHash: deployment.eventTokenHash,
          requestedBy: deployment.requestedBy,
          requestedAt: new Date(deployment.requestedAt),
          updatedAt: new Date(deployment.updatedAt),
        },
        select: DEPLOYMENT_SELECTION,
      });
      return withoutToken(toDeploymentRecord(row));
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        return 'ACTIVE_DEPLOYMENT_CONFLICT';
      }
      throw error;
    }
  }

  public async listDeployments(deviceId: string): Promise<readonly FirmwareDeployment[]> {
    const rows = await this.prisma.client.firmwareDeployment.findMany({
      where: { deviceId },
      select: DEPLOYMENT_SELECTION,
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map((row) => withoutToken(toDeploymentRecord(row)));
  }

  public async findDeployment(id: string): Promise<FirmwareDeploymentRecord | undefined> {
    const row = await this.prisma.client.firmwareDeployment.findUnique({
      where: { id },
      select: DEPLOYMENT_SELECTION,
    });
    return row === null ? undefined : toDeploymentRecord(row);
  }

  public async findRebootingTimedOut(
    limit: number,
    updatedBefore: string,
  ): Promise<readonly FirmwareDeploymentRecord[]> {
    const rows = await this.prisma.client.firmwareDeployment.findMany({
      where: { status: 'REBOOTING', updatedAt: { lte: new Date(updatedBefore) } },
      select: DEPLOYMENT_SELECTION,
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    return rows.map(toDeploymentRecord);
  }

  public async confirmRebootedDeployment(
    deviceId: string,
    releaseVersion: string,
    confirmedAt: string,
  ): Promise<FirmwareDeployment | undefined> {
    const now = new Date(confirmedAt);
    const result = await this.prisma.client.firmwareDeployment.updateMany({
      where: { deviceId, releaseVersion, status: 'REBOOTING' },
      data: {
        status: 'SUCCEEDED',
        progressPercent: 100,
        finishedAt: now,
        updatedAt: now,
        error: null,
      },
    });
    if (result.count === 0) return undefined;
    const row = await this.prisma.client.firmwareDeployment.findFirst({
      where: { deviceId, releaseVersion, status: 'SUCCEEDED', finishedAt: now },
      select: DEPLOYMENT_SELECTION,
      orderBy: { requestedAt: 'desc' },
    });
    return row === null ? undefined : withoutToken(toDeploymentRecord(row));
  }

  public async updateDeployment(
    id: string,
    expectedStatus: FirmwareDeploymentStatus,
    status: FirmwareDeploymentStatus,
    progressPercent: number,
    updatedAt: string,
    error?: string,
  ): Promise<FirmwareDeployment | undefined> {
    const now = new Date(updatedAt);
    const result = await this.prisma.client.firmwareDeployment.updateMany({
      where: { id, status: expectedStatus },
      data: {
        status,
        progressPercent,
        error: error ?? null,
        updatedAt: now,
        ...(status === 'ACCEPTED' ? { startedAt: now } : {}),
        ...(['SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'CANCELLED'].includes(status)
          ? { finishedAt: now }
          : {}),
      },
    });
    if (result.count === 0) return undefined;
    const row = await this.prisma.client.firmwareDeployment.findUnique({
      where: { id },
      select: DEPLOYMENT_SELECTION,
    });
    return row === null ? undefined : withoutToken(toDeploymentRecord(row));
  }

  public async createCampaign(
    campaign: FirmwareCampaignRecord,
  ): Promise<FirmwareCampaign | 'NAME_CONFLICT'> {
    try {
      const row = await this.prisma.client.firmwareCampaign.create({
        data: {
          id: campaign.id,
          organizationId: campaign.organizationId,
          name: campaign.name,
          releaseId: campaign.releaseId,
          releaseVersion: campaign.releaseVersion,
          status: campaign.status,
          canarySize: campaign.canarySize,
          batchSize: campaign.batchSize,
          currentBatch: campaign.currentBatch,
          requestedBy: campaign.requestedBy,
          error: campaign.error,
          createdAt: new Date(campaign.createdAt),
          updatedAt: new Date(campaign.updatedAt),
          targets: {
            create: campaign.targets.map((target) => ({
              id: target.id,
              organizationId: campaign.organizationId,
              deviceId: target.deviceId,
              batchNumber: target.batchNumber,
              createdAt: new Date(campaign.createdAt),
              updatedAt: new Date(target.updatedAt),
            })),
          },
        },
        select: CAMPAIGN_SELECTION,
      });
      return toCampaign(row);
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) return 'NAME_CONFLICT';
      throw error;
    }
  }

  public async listCampaigns(): Promise<readonly FirmwareCampaign[]> {
    const rows = await this.prisma.client.firmwareCampaign.findMany({
      select: CAMPAIGN_SELECTION,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toCampaign);
  }

  public async findCampaign(id: string): Promise<FirmwareCampaign | undefined> {
    const row = await this.prisma.client.firmwareCampaign.findUnique({
      where: { id },
      select: CAMPAIGN_SELECTION,
    });
    return row === null ? undefined : toCampaign(row);
  }

  public async transitionCampaign(
    id: string,
    expectedStatus: FirmwareCampaignStatus,
    expectedCurrentBatch: number | null,
    status: FirmwareCampaignStatus,
    currentBatch: number | undefined,
    updatedAt: string,
    error?: string,
  ): Promise<FirmwareCampaign | undefined> {
    const result = await this.prisma.client.firmwareCampaign.updateMany({
      where: { id, status: expectedStatus, currentBatch: expectedCurrentBatch },
      data: {
        status,
        currentBatch,
        error: error ?? null,
        updatedAt: new Date(updatedAt),
      },
    });
    return result.count === 0 ? undefined : this.findCampaign(id);
  }

  public async linkCampaignDeployment(
    targetId: string,
    deploymentId: string,
    updatedAt: string,
  ): Promise<void> {
    await this.prisma.client.firmwareCampaignTarget.update({
      where: { id: targetId },
      data: { deploymentId, updatedAt: new Date(updatedAt) },
    });
  }

  public async cancelPendingCampaignTargets(campaignId: string, updatedAt: string): Promise<void> {
    const timestamp = new Date(updatedAt);
    await this.prisma.client.firmwareCampaignTarget.updateMany({
      where: { campaignId, deploymentId: null, cancelledAt: null },
      data: { cancelledAt: timestamp, updatedAt: timestamp },
    });
  }
}

function toCampaign(row: CampaignRow): FirmwareCampaign {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    releaseId: row.releaseId,
    releaseVersion: row.releaseVersion,
    status: row.status,
    canarySize: row.canarySize,
    batchSize: row.batchSize,
    ...(row.currentBatch === null ? {} : { currentBatch: row.currentBatch }),
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.error === null ? {} : { error: row.error }),
    targets: row.targets.map(toCampaignTarget),
  };
}

function toCampaignTarget(row: CampaignRow['targets'][number]): FirmwareCampaignTarget {
  if (row.deployment === null) {
    return {
      id: row.id,
      deviceId: row.deviceId,
      deviceName: row.device.name,
      batchNumber: row.batchNumber,
      status: row.cancelledAt === null ? 'PENDING' : 'CANCELLED',
      progressPercent: 0,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  return {
    id: row.id,
    deviceId: row.deviceId,
    deviceName: row.device.name,
    batchNumber: row.batchNumber,
    ...(row.deploymentId === null ? {} : { deploymentId: row.deploymentId }),
    status: row.deployment.status,
    progressPercent: row.deployment.progressPercent,
    ...(row.deployment.error === null ? {} : { error: row.deployment.error }),
    updatedAt: row.deployment.updatedAt.toISOString(),
  };
}

function toRelease(row: ReleaseRow): FirmwareRelease {
  return {
    id: row.id,
    organizationId: row.organizationId,
    version: row.version,
    deviceModel: row.deviceModel,
    ...(row.hardwareRevision === null ? {} : { hardwareRevision: row.hardwareRevision }),
    ...(row.artifactUrl === null ? {} : { artifactUrl: row.artifactUrl }),
    ...(row.artifactStorageProvider === null
      ? {}
      : { artifactStorageProvider: decodeStorageProvider(row.artifactStorageProvider) }),
    ...(row.artifactBucket === null ? {} : { artifactBucket: row.artifactBucket }),
    ...(row.artifactObjectKey === null ? {} : { artifactObjectKey: row.artifactObjectKey }),
    ...(row.artifactFileName === null ? {} : { artifactFileName: row.artifactFileName }),
    ...(row.artifactContentType === null ? {} : { artifactContentType: row.artifactContentType }),
    ...(row.artifactSizeBytes === null ? {} : { artifactSizeBytes: row.artifactSizeBytes }),
    sha256: row.sha256,
    signature: row.signature,
    ...(row.signingKeyId === null ? {} : { signingKeyId: row.signingKeyId }),
    ...(row.signaturePayload === null ? {} : { signaturePayload: row.signaturePayload }),
    ...(row.signatureVerifiedAt === null
      ? {}
      : { signatureVerifiedAt: row.signatureVerifiedAt.toISOString() }),
    ...(row.releaseNotes === null ? {} : { releaseNotes: row.releaseNotes }),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function decodeStorageProvider(value: string): 'MINIO' | 'GCS' {
  if (value === 'MINIO' || value === 'GCS') return value;
  throw new Error('Firmware release has an invalid artifact storage provider.');
}

function toDeploymentRecord(row: DeploymentRow): FirmwareDeploymentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    deviceId: row.deviceId,
    releaseId: row.releaseId,
    releaseVersion: row.releaseVersion,
    status: row.status,
    progressPercent: row.progressPercent,
    ...(row.previousVersion === null ? {} : { previousVersion: row.previousVersion }),
    ...(row.error === null ? {} : { error: row.error }),
    eventTokenHash: row.eventTokenHash,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt.toISOString(),
    ...(row.startedAt === null ? {} : { startedAt: row.startedAt.toISOString() }),
    ...(row.finishedAt === null ? {} : { finishedAt: row.finishedAt.toISOString() }),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function withoutToken(record: FirmwareDeploymentRecord): FirmwareDeployment {
  const { eventTokenHash, ...deployment } = record;
  void eventTokenHash;
  return deployment;
}
