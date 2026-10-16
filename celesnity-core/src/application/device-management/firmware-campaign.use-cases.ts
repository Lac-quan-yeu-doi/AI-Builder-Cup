import { createHash } from 'node:crypto';

import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IFirmwareArtifactStore } from '@application/device-management/interfaces/i-firmware-artifact-store';
import type { IFirmwareCampaignRepository } from '@application/device-management/interfaces/i-firmware-campaign.repository';
import type { IFirmwareCommandPublisher } from '@application/device-management/interfaces/i-firmware-command-publisher';
import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IStreamingSecretGenerator } from '@application/streaming/interfaces/i-streaming-secret-generator';
import { DeviceError } from '@domain/device-management/errors/device.errors';
import type { DeviceRecord } from '@domain/device-management/models/device';
import type {
  FirmwareCampaign,
  FirmwareCampaignStatus,
  FirmwareCampaignTarget,
  FirmwareDeployment,
  FirmwareRelease,
} from '@domain/device-management/models/firmware';

export interface CreateFirmwareCampaignInput {
  readonly name: string;
  readonly releaseId: string;
  readonly deviceIds: readonly string[];
  readonly canarySize: number;
  readonly batchSize: number;
}

const ACTIVE_DEPLOYMENTS = new Set([
  'QUEUED',
  'DISPATCHED',
  'ACCEPTED',
  'DOWNLOADING',
  'VERIFYING',
  'INSTALLING',
  'REBOOTING',
]);
const FAILED_DEPLOYMENTS = new Set(['FAILED', 'ROLLED_BACK', 'CANCELLED']);

export class FirmwareCampaignUseCases {
  public constructor(
    private readonly campaigns: IFirmwareCampaignRepository,
    private readonly firmware: IFirmwareRepository,
    private readonly devices: IDeviceRepository,
    private readonly publisher: IFirmwareCommandPublisher,
    private readonly artifacts: IFirmwareArtifactStore,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly secrets: IStreamingSecretGenerator,
    private readonly contexts: AuthenticatedContextStore,
    private readonly bootConfirmationTimeoutSeconds: number,
  ) {}

  public async create(input: CreateFirmwareCampaignInput): Promise<FirmwareCampaign> {
    const release = await this.requireRelease(input.releaseId);
    const deviceIds = [...new Set(input.deviceIds)];
    if (deviceIds.length === 0 || deviceIds.length > 500) {
      throw DeviceError.validation('A firmware campaign requires 1 to 500 unique devices.');
    }
    const canarySize = boundedInteger(input.canarySize, 'Canary size', 1, deviceIds.length);
    const batchSize = boundedInteger(input.batchSize, 'Batch size', 1, 100);
    const devices = await Promise.all(
      deviceIds.map((id) => this.requireCompatibleDevice(id, release)),
    );
    const context = this.contexts.require();
    const now = this.clock.now().toISOString();
    const created = await this.campaigns.createCampaign({
      id: this.ids.next(),
      organizationId: context.organizationId,
      name: clean(input.name, 'Campaign name', 160),
      releaseId: release.id,
      releaseVersion: release.version,
      status: 'DRAFT',
      canarySize,
      batchSize,
      requestedBy: context.identityId,
      createdAt: now,
      updatedAt: now,
      targets: devices.map((device, index) => ({
        id: this.ids.next(),
        deviceId: device.id,
        deviceName: device.name,
        batchNumber: batchNumber(index, canarySize, batchSize),
        status: 'PENDING',
        progressPercent: 0,
        updatedAt: now,
      })),
    });
    if (created === 'NAME_CONFLICT') {
      throw DeviceError.stateConflict('A firmware campaign with this name already exists.');
    }
    return created;
  }

  public list(): Promise<readonly FirmwareCampaign[]> {
    return this.campaigns.listCampaigns();
  }

  public async get(id: string): Promise<FirmwareCampaign> {
    return this.requireCampaign(id);
  }

  public async start(id: string): Promise<FirmwareCampaign> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status !== 'DRAFT') {
      throw DeviceError.stateConflict('Only a draft firmware campaign can be started.');
    }
    const running = await this.campaigns.transitionCampaign(
      campaign.id,
      'DRAFT',
      null,
      'RUNNING',
      0,
      this.clock.now().toISOString(),
    );
    if (running === undefined) throw campaignChanged();
    return this.dispatchBatch(running, 0);
  }

  public async advance(id: string): Promise<FirmwareCampaign> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status !== 'RUNNING' || campaign.currentBatch === undefined) {
      throw DeviceError.stateConflict('Only a running firmware campaign can advance.');
    }
    const current = campaign.targets.filter(
      (target) => target.batchNumber === campaign.currentBatch,
    );
    if (current.some((target) => ACTIVE_DEPLOYMENTS.has(target.status))) {
      throw DeviceError.stateConflict('The current firmware batch is still running.');
    }
    if (current.some((target) => FAILED_DEPLOYMENTS.has(target.status))) {
      return this.transition(
        campaign,
        'PAUSED',
        campaign.currentBatch,
        'The campaign paused because the current batch did not fully succeed.',
      );
    }
    if (current.some((target) => target.status === 'PENDING')) {
      return this.dispatchBatch(campaign, campaign.currentBatch);
    }
    if (current.length === 0 || current.some((target) => target.status !== 'SUCCEEDED')) {
      throw DeviceError.stateConflict('The current firmware batch has not completed successfully.');
    }
    const pending = campaign.targets.filter((target) => target.status === 'PENDING');
    if (pending.length === 0) {
      return this.transition(campaign, 'COMPLETED', campaign.currentBatch);
    }
    const nextBatch = Math.min(...pending.map((target) => target.batchNumber));
    const claimed = await this.campaigns.transitionCampaign(
      campaign.id,
      'RUNNING',
      campaign.currentBatch,
      'RUNNING',
      nextBatch,
      this.clock.now().toISOString(),
    );
    if (claimed === undefined) throw campaignChanged();
    return this.dispatchBatch(claimed, nextBatch);
  }

  public async pause(id: string): Promise<FirmwareCampaign> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status !== 'RUNNING') {
      throw DeviceError.stateConflict('Only a running firmware campaign can be paused.');
    }
    return this.transition(campaign, 'PAUSED', campaign.currentBatch);
  }

  public async resume(id: string): Promise<FirmwareCampaign> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status !== 'PAUSED') {
      throw DeviceError.stateConflict('Only a paused firmware campaign can be resumed.');
    }
    if (campaign.error !== undefined) {
      throw DeviceError.stateConflict(
        'A firmware campaign paused by an error must be aborted before creating a replacement.',
      );
    }
    return this.transition(campaign, 'RUNNING', campaign.currentBatch);
  }

  public async abort(id: string): Promise<FirmwareCampaign> {
    const campaign = await this.requireCampaign(id);
    if (!['DRAFT', 'RUNNING', 'PAUSED'].includes(campaign.status)) {
      throw DeviceError.stateConflict('This firmware campaign can no longer be aborted.');
    }
    const now = this.clock.now().toISOString();
    const aborted = await this.campaigns.transitionCampaign(
      campaign.id,
      campaign.status,
      campaign.currentBatch ?? null,
      'ABORTED',
      campaign.currentBatch,
      now,
      'Campaign aborted; commands already delivered to devices continue to report their outcome.',
    );
    if (aborted === undefined) throw campaignChanged();
    await this.campaigns.cancelPendingCampaignTargets(campaign.id, now);
    return this.requireCampaign(campaign.id);
  }

  private async dispatchBatch(
    campaign: FirmwareCampaign,
    batch: number,
  ): Promise<FirmwareCampaign> {
    const release = await this.requireRelease(campaign.releaseId);
    try {
      for (const target of campaign.targets.filter(
        (candidate) => candidate.batchNumber === batch && candidate.status === 'PENDING',
      )) {
        await this.dispatchTarget(campaign, target, release);
      }
      const refreshed = await this.requireCampaign(campaign.id);
      if (
        refreshed.targets.some(
          (target) => target.batchNumber === batch && FAILED_DEPLOYMENTS.has(target.status),
        )
      ) {
        return this.transition(
          refreshed,
          'PAUSED',
          batch,
          'The campaign paused because a firmware command could not be dispatched.',
        );
      }
      return refreshed;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'Firmware batch dispatch failed.';
      const refreshed = await this.requireCampaign(campaign.id);
      return this.transition(refreshed, 'PAUSED', batch, message);
    }
  }

  private async dispatchTarget(
    campaign: FirmwareCampaign,
    target: FirmwareCampaignTarget,
    release: FirmwareRelease,
  ): Promise<FirmwareDeployment> {
    const device = await this.requireCompatibleDevice(target.deviceId, release);
    const now = this.clock.now().toISOString();
    const token = this.secrets.generate();
    const deploymentId = this.ids.next();
    const created = await this.firmware.createDeployment({
      id: deploymentId,
      organizationId: campaign.organizationId,
      deviceId: device.id,
      releaseId: release.id,
      releaseVersion: release.version,
      status: 'QUEUED',
      progressPercent: 0,
      ...(device.currentFirmwareVersion === undefined
        ? {}
        : { previousVersion: device.currentFirmwareVersion }),
      requestedBy: campaign.requestedBy,
      requestedAt: now,
      updatedAt: now,
      eventTokenHash: createHash('sha256').update(token).digest('hex'),
    });
    if (created === 'ACTIVE_DEPLOYMENT_CONFLICT') {
      throw DeviceError.stateConflict(`${device.name} already has an active firmware deployment.`);
    }
    await this.campaigns.linkCampaignDeployment(target.id, deploymentId, now);
    const dispatched = await this.firmware.updateDeployment(
      deploymentId,
      'QUEUED',
      'DISPATCHED',
      0,
      now,
    );
    if (dispatched === undefined) throw campaignChanged();
    try {
      const artifactUrl = release.artifactUrl ?? (await this.artifacts.createDownloadUrl(release));
      await this.publisher.publish(device, {
        deploymentId,
        version: release.version,
        artifactUrl,
        artifactSizeBytes: release.artifactSizeBytes ?? 0,
        sha256: release.sha256,
        signatureAlgorithm: 'ED25519',
        signature: release.signature,
        signingKeyId: release.signingKeyId ?? '',
        signaturePayload: release.signaturePayload ?? '',
        deviceModel: release.deviceModel,
        ...(release.hardwareRevision === undefined
          ? {}
          : { hardwareRevision: release.hardwareRevision }),
        eventPath: `/device-management/firmware-deployments/${deploymentId}/events`,
        eventToken: token,
        download: { resumable: true, chunkSizeBytes: 256 * 1024 },
        boot: {
          strategy: 'A_B',
          confirmationTimeoutSeconds: this.bootConfirmationTimeoutSeconds,
        },
      });
      return dispatched;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'Command dispatch failed.';
      return (
        (await this.firmware.updateDeployment(
          deploymentId,
          'DISPATCHED',
          'FAILED',
          0,
          now,
          message,
        )) ?? dispatched
      );
    }
  }

  private async requireCompatibleDevice(
    id: string,
    release: FirmwareRelease,
  ): Promise<DeviceRecord> {
    const device = await this.devices.findById(id);
    if (device === undefined || device.status === 'RETIRED') throw DeviceError.notFound();
    if (device.status !== 'ACTIVE' || device.lifecycleState !== 'COMMISSIONED') {
      throw DeviceError.stateConflict(
        `${device.name} is not commissioned with an active command channel and cannot join the campaign.`,
      );
    }
    if (
      device.model !== release.deviceModel ||
      (release.hardwareRevision !== undefined &&
        release.hardwareRevision !== device.hardwareRevision)
    ) {
      throw DeviceError.validation(`${device.name} is not compatible with the firmware release.`);
    }
    if (device.currentFirmwareVersion === release.version) {
      throw DeviceError.stateConflict(
        `${device.name} already reports the campaign firmware version.`,
      );
    }
    return device;
  }

  private async requireRelease(id: string): Promise<FirmwareRelease> {
    const release = await this.firmware.findRelease(id);
    if (release === undefined) throw DeviceError.validation('Firmware release was not found.');
    if (
      release.signingKeyId === undefined ||
      release.signaturePayload === undefined ||
      release.signatureVerifiedAt === undefined
    ) {
      throw DeviceError.stateConflict(
        'Firmware release does not have a Celesnity-managed signature.',
      );
    }
    if (release.artifactSizeBytes === undefined) {
      throw DeviceError.stateConflict(
        'Firmware campaign requires a managed artifact with a known size.',
      );
    }
    return release;
  }

  private async requireCampaign(id: string): Promise<FirmwareCampaign> {
    const campaign = await this.campaigns.findCampaign(id);
    if (campaign === undefined) throw DeviceError.notFound();
    return campaign;
  }

  private async transition(
    campaign: FirmwareCampaign,
    status: FirmwareCampaignStatus,
    currentBatch: number | undefined,
    error?: string,
  ): Promise<FirmwareCampaign> {
    const updated = await this.campaigns.transitionCampaign(
      campaign.id,
      campaign.status,
      campaign.currentBatch ?? null,
      status,
      currentBatch,
      this.clock.now().toISOString(),
      error,
    );
    if (updated === undefined) throw campaignChanged();
    return updated;
  }
}

function batchNumber(index: number, canarySize: number, batchSize: number): number {
  return index < canarySize ? 0 : 1 + Math.floor((index - canarySize) / batchSize);
}

function boundedInteger(value: number, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw DeviceError.validation(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function clean(value: string, field: string, maximum: number): string {
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > maximum) {
    throw DeviceError.validation(`${field} must contain 1 to ${maximum} characters.`);
  }
  return cleaned;
}

function campaignChanged(): ReturnType<typeof DeviceError.stateConflict> {
  return DeviceError.stateConflict('Firmware campaign changed concurrently.');
}
