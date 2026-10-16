import { createHash, timingSafeEqual } from 'node:crypto';

import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IFirmwareCommandPublisher } from '@application/device-management/interfaces/i-firmware-command-publisher';
import type { IFirmwareArtifactStore } from '@application/device-management/interfaces/i-firmware-artifact-store';
import type { IFirmwareSigner } from '@application/device-management/interfaces/i-firmware-signer';
import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IStreamingSecretGenerator } from '@application/streaming/interfaces/i-streaming-secret-generator';
import { DeviceError } from '@domain/device-management/errors/device.errors';
import type {
  FirmwareDeployment,
  FirmwareDeploymentStatus,
  FirmwareRelease,
} from '@domain/device-management/models/firmware';
import { firmwareSigningPayload } from '@domain/device-management/services/firmware-signing-manifest';

export interface CreateFirmwareReleaseInput {
  readonly version: string;
  readonly deviceModel: string;
  readonly hardwareRevision?: string;
  readonly artifactUrl: string;
  readonly sha256: string;
  readonly signature: string;
  readonly releaseNotes?: string;
}

export interface UploadFirmwareReleaseInput {
  readonly version: string;
  readonly deviceModel: string;
  readonly hardwareRevision?: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly releaseNotes?: string;
}

export interface StartFirmwareDeploymentInput {
  readonly releaseId: string;
}

export interface ReportFirmwareDeploymentEventInput {
  readonly token: string;
  readonly status: Exclude<
    FirmwareDeploymentStatus,
    'QUEUED' | 'DISPATCHED' | 'SUCCEEDED' | 'CANCELLED'
  >;
  readonly progressPercent?: number;
  readonly error?: string;
}

const TERMINAL = new Set<FirmwareDeploymentStatus>([
  'SUCCEEDED',
  'FAILED',
  'ROLLED_BACK',
  'CANCELLED',
]);

const TRANSITIONS: Readonly<Record<FirmwareDeploymentStatus, readonly FirmwareDeploymentStatus[]>> =
  {
    QUEUED: ['DISPATCHED', 'FAILED', 'CANCELLED'],
    DISPATCHED: ['ACCEPTED', 'FAILED', 'CANCELLED'],
    ACCEPTED: ['DOWNLOADING', 'FAILED', 'CANCELLED'],
    DOWNLOADING: ['VERIFYING', 'FAILED', 'CANCELLED'],
    VERIFYING: ['INSTALLING', 'FAILED', 'CANCELLED'],
    INSTALLING: ['REBOOTING', 'FAILED', 'ROLLED_BACK'],
    REBOOTING: ['FAILED', 'ROLLED_BACK'],
    SUCCEEDED: [],
    FAILED: [],
    ROLLED_BACK: [],
    CANCELLED: [],
  };

export class FirmwareUseCases {
  public constructor(
    private readonly repository: IFirmwareRepository,
    private readonly devices: IDeviceRepository,
    private readonly publisher: IFirmwareCommandPublisher,
    private readonly artifacts: IFirmwareArtifactStore,
    private readonly signer: IFirmwareSigner,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly secrets: IStreamingSecretGenerator,
    private readonly contexts: AuthenticatedContextStore,
    private readonly bootConfirmationTimeoutSeconds: number,
  ) {}

  public async uploadRelease(input: UploadFirmwareReleaseInput): Promise<FirmwareRelease> {
    const context = this.contexts.require();
    const id = this.ids.next();
    const bytes = validatedFirmwareBytes(input.bytes);
    const version = clean(input.version, 'Firmware version', 120);
    const deviceModel = clean(input.deviceModel, 'Device model', 120);
    const hardwareRevision =
      input.hardwareRevision === undefined
        ? undefined
        : clean(input.hardwareRevision, 'Hardware revision', 80);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const artifact = await this.artifacts.put({
      organizationId: context.organizationId,
      releaseId: id,
      fileName: validatedFirmwareFileName(input.fileName),
      contentType: clean(input.contentType || 'application/octet-stream', 'Content type', 160),
      bytes,
      sha256,
    });
    const signaturePayload = firmwareSigningPayload({
      version,
      deviceModel,
      ...(hardwareRevision === undefined ? {} : { hardwareRevision }),
      artifactSizeBytes: artifact.sizeBytes,
      sha256,
    });
    let managedSignature;
    try {
      managedSignature = await this.signer.sign(Buffer.from(signaturePayload, 'utf8'));
    } catch (error) {
      await this.artifacts.remove(artifact).catch(() => undefined);
      throw error;
    }
    const verifiedAt = this.clock.now().toISOString();
    const release: FirmwareRelease = {
      id,
      organizationId: context.organizationId,
      version,
      deviceModel,
      ...(hardwareRevision === undefined ? {} : { hardwareRevision }),
      artifactStorageProvider: artifact.storageProvider,
      artifactBucket: artifact.bucket,
      artifactObjectKey: artifact.objectKey,
      artifactFileName: artifact.fileName,
      artifactContentType: artifact.contentType,
      artifactSizeBytes: artifact.sizeBytes,
      sha256,
      signature: managedSignature.signature,
      signingKeyId: managedSignature.signingKeyId,
      signaturePayload,
      signatureVerifiedAt: verifiedAt,
      ...(input.releaseNotes === undefined
        ? {}
        : { releaseNotes: clean(input.releaseNotes, 'Release notes', 2000) }),
      createdBy: context.identityId,
      createdAt: verifiedAt,
    };
    let created: FirmwareRelease | 'VERSION_CONFLICT';
    try {
      created = await this.repository.createRelease(release);
    } catch (error) {
      await this.artifacts.remove(artifact).catch(() => undefined);
      throw error;
    }
    if (created === 'VERSION_CONFLICT') {
      await this.artifacts.remove(artifact).catch(() => undefined);
      throw DeviceError.stateConflict('This firmware version already exists for the device model.');
    }
    return created;
  }

  public async createRelease(input: CreateFirmwareReleaseInput): Promise<FirmwareRelease> {
    const context = this.contexts.require();
    const artifactUrl = validatedArtifactUrl(input.artifactUrl);
    const release: FirmwareRelease = {
      id: this.ids.next(),
      organizationId: context.organizationId,
      version: clean(input.version, 'Firmware version', 120),
      deviceModel: clean(input.deviceModel, 'Device model', 120),
      ...(input.hardwareRevision === undefined
        ? {}
        : { hardwareRevision: clean(input.hardwareRevision, 'Hardware revision', 80) }),
      artifactUrl,
      sha256: validatedSha256(input.sha256),
      signature: validatedSignature(input.signature),
      ...(input.releaseNotes === undefined
        ? {}
        : { releaseNotes: clean(input.releaseNotes, 'Release notes', 2000) }),
      createdBy: context.identityId,
      createdAt: this.clock.now().toISOString(),
    };
    const created = await this.repository.createRelease(release);
    if (created === 'VERSION_CONFLICT') {
      throw DeviceError.stateConflict('This firmware version already exists for the device model.');
    }
    return created;
  }

  public listReleases(): Promise<readonly FirmwareRelease[]> {
    return this.repository.listReleases();
  }

  public async startDeployment(
    deviceId: string,
    input: StartFirmwareDeploymentInput,
  ): Promise<FirmwareDeployment> {
    const device = await this.devices.findById(deviceId);
    if (device === undefined || device.status === 'RETIRED') throw DeviceError.notFound();
    if (device.status !== 'ACTIVE' || device.lifecycleState !== 'COMMISSIONED') {
      throw DeviceError.stateConflict(
        'Firmware can only be deployed to a commissioned device with an active command channel.',
      );
    }
    const release = await this.repository.findRelease(input.releaseId);
    if (release === undefined) throw DeviceError.validation('Firmware release was not found.');
    if (
      release.deviceModel !== device.model ||
      (release.hardwareRevision !== undefined &&
        release.hardwareRevision !== device.hardwareRevision)
    ) {
      throw DeviceError.validation('Firmware release is not compatible with this device.');
    }
    if (release.version === device.currentFirmwareVersion) {
      throw DeviceError.stateConflict('The device already reports this firmware version.');
    }
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
        'Firmware deployment requires a managed artifact with a known size.',
      );
    }

    const now = this.clock.now().toISOString();
    const token = this.secrets.generate();
    const deployment = await this.repository.createDeployment({
      id: this.ids.next(),
      organizationId: device.organizationId,
      deviceId: device.id,
      releaseId: release.id,
      releaseVersion: release.version,
      status: 'QUEUED',
      progressPercent: 0,
      ...(device.currentFirmwareVersion === undefined
        ? {}
        : { previousVersion: device.currentFirmwareVersion }),
      requestedBy: this.contexts.require().identityId,
      requestedAt: now,
      updatedAt: now,
      eventTokenHash: tokenHash(token),
    });
    if (deployment === 'ACTIVE_DEPLOYMENT_CONFLICT') {
      throw DeviceError.stateConflict('This device already has an active firmware deployment.');
    }

    const dispatched = await this.repository.updateDeployment(
      deployment.id,
      'QUEUED',
      'DISPATCHED',
      0,
      now,
    );
    if (dispatched === undefined) {
      throw DeviceError.stateConflict('Firmware deployment could not be queued for dispatch.');
    }
    try {
      const artifactUrl = release.artifactUrl ?? (await this.artifacts.createDownloadUrl(release));
      await this.publisher.publish(device, {
        deploymentId: deployment.id,
        version: release.version,
        artifactUrl,
        artifactSizeBytes: release.artifactSizeBytes,
        sha256: release.sha256,
        signatureAlgorithm: 'ED25519',
        signature: release.signature,
        signingKeyId: release.signingKeyId,
        signaturePayload: release.signaturePayload,
        deviceModel: release.deviceModel,
        ...(release.hardwareRevision === undefined
          ? {}
          : { hardwareRevision: release.hardwareRevision }),
        eventPath: `/device-management/firmware-deployments/${deployment.id}/events`,
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
      await this.repository.updateDeployment(
        deployment.id,
        'DISPATCHED',
        'FAILED',
        0,
        now,
        message,
      );
      throw DeviceError.stateConflict('Firmware command could not be dispatched.');
    }
  }

  public async listDeployments(deviceId: string): Promise<readonly FirmwareDeployment[]> {
    const device = await this.devices.findById(deviceId);
    if (device === undefined) throw DeviceError.notFound();
    return this.repository.listDeployments(deviceId);
  }

  public async authorizeEvent(deploymentId: string, token: string): Promise<void> {
    const deployment = await this.repository.findDeployment(deploymentId);
    if (deployment === undefined || !safeTokenEqual(deployment.eventTokenHash, tokenHash(token))) {
      throw DeviceError.notFound();
    }
  }

  public async reportEvent(
    deploymentId: string,
    input: ReportFirmwareDeploymentEventInput,
  ): Promise<FirmwareDeployment> {
    const deployment = await this.repository.findDeployment(deploymentId);
    if (
      deployment === undefined ||
      !safeTokenEqual(deployment.eventTokenHash, tokenHash(input.token))
    ) {
      throw DeviceError.notFound();
    }
    if (TERMINAL.has(deployment.status) || !TRANSITIONS[deployment.status].includes(input.status)) {
      throw DeviceError.stateConflict(
        `Firmware deployment cannot transition from ${deployment.status} to ${input.status}.`,
      );
    }
    const progress = normalizedProgress(input.status, input.progressPercent);
    const error = input.error === undefined ? undefined : clean(input.error, 'Firmware error', 500);
    const now = this.clock.now().toISOString();
    return this.contexts.runBackground(
      deployment.organizationId,
      async () => {
        const updated = await this.repository.updateDeployment(
          deployment.id,
          deployment.status,
          input.status,
          progress,
          now,
          error,
        );
        if (updated === undefined) {
          throw DeviceError.stateConflict('Firmware deployment changed while reporting progress.');
        }
        return updated;
      },
      'DEVICES',
    );
  }
}

const MAX_FIRMWARE_BYTES = 64 * 1024 * 1024;

function validatedFirmwareBytes(value: Uint8Array): Uint8Array {
  if (value.byteLength === 0 || value.byteLength > MAX_FIRMWARE_BYTES) {
    throw DeviceError.validation('Firmware file must contain between 1 byte and 64 MiB.');
  }
  return value;
}

function validatedFirmwareFileName(value: string): string {
  const cleaned = clean(value, 'Firmware file name', 255);
  if (!/\.(bin|hex|uf2|img)$/iu.test(cleaned)) {
    throw DeviceError.validation('Firmware file must use .bin, .hex, .uf2, or .img.');
  }
  return cleaned;
}

function validatedArtifactUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') throw new Error('invalid protocol');
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    throw DeviceError.validation('Firmware artifact URL must be a valid HTTPS URL.');
  }
}

function validatedSha256(value: string): string {
  const cleaned = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(cleaned)) {
    throw DeviceError.validation(
      'Firmware SHA-256 must contain exactly 64 hexadecimal characters.',
    );
  }
  return cleaned;
}

function validatedSignature(value: string): string {
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9+/]{86}==$/u.test(cleaned) || Buffer.from(cleaned, 'base64').length !== 64) {
    throw DeviceError.validation(
      'Firmware signature must be a 64-byte Ed25519 signature in base64.',
    );
  }
  return cleaned;
}

function clean(value: string, field: string, max: number): string {
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > max) {
    throw DeviceError.validation(`${field} must contain between 1 and ${max} characters.`);
  }
  return cleaned;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeTokenEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function normalizedProgress(
  status: ReportFirmwareDeploymentEventInput['status'],
  supplied: number | undefined,
): number {
  const progress = supplied ?? 0;
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw DeviceError.validation('Firmware progress must be an integer from 0 to 100.');
  }
  return progress;
}
