export type FirmwareDeploymentStatus =
  | 'QUEUED'
  | 'DISPATCHED'
  | 'ACCEPTED'
  | 'DOWNLOADING'
  | 'VERIFYING'
  | 'INSTALLING'
  | 'REBOOTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'CANCELLED';

export interface FirmwareRelease {
  readonly id: string;
  readonly organizationId: string;
  readonly version: string;
  readonly deviceModel: string;
  readonly hardwareRevision?: string;
  readonly artifactUrl?: string;
  readonly artifactStorageProvider?: 'MINIO' | 'GCS';
  readonly artifactBucket?: string;
  readonly artifactObjectKey?: string;
  readonly artifactFileName?: string;
  readonly artifactContentType?: string;
  readonly artifactSizeBytes?: number;
  readonly sha256: string;
  readonly signature: string;
  readonly signingKeyId?: string;
  readonly signaturePayload?: string;
  readonly signatureVerifiedAt?: string;
  readonly releaseNotes?: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ManagedFirmwareArtifact {
  readonly storageProvider: 'MINIO' | 'GCS';
  readonly bucket: string;
  readonly objectKey: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface FirmwareDeployment {
  readonly id: string;
  readonly organizationId: string;
  readonly deviceId: string;
  readonly releaseId: string;
  readonly releaseVersion: string;
  readonly status: FirmwareDeploymentStatus;
  readonly progressPercent: number;
  readonly previousVersion?: string;
  readonly error?: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
}

export interface FirmwareDeploymentRecord extends FirmwareDeployment {
  readonly eventTokenHash: string;
}

export interface FirmwareCommand {
  readonly deploymentId: string;
  readonly version: string;
  readonly artifactUrl: string;
  readonly artifactSizeBytes: number;
  readonly sha256: string;
  readonly signatureAlgorithm: 'ED25519';
  readonly signature: string;
  readonly signingKeyId: string;
  readonly signaturePayload: string;
  readonly deviceModel: string;
  readonly hardwareRevision?: string;
  readonly eventPath: string;
  readonly eventToken: string;
  readonly download: {
    readonly resumable: true;
    readonly chunkSizeBytes: number;
  };
  readonly boot: {
    readonly strategy: 'A_B';
    readonly confirmationTimeoutSeconds: number;
  };
}

export type FirmwareCampaignStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ABORTED';

export type FirmwareCampaignTargetStatus = 'PENDING' | FirmwareDeploymentStatus;

export interface FirmwareCampaignTarget {
  readonly id: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly batchNumber: number;
  readonly deploymentId?: string;
  readonly status: FirmwareCampaignTargetStatus;
  readonly progressPercent: number;
  readonly error?: string;
  readonly updatedAt: string;
}

export interface FirmwareCampaign {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly releaseId: string;
  readonly releaseVersion: string;
  readonly status: FirmwareCampaignStatus;
  readonly canarySize: number;
  readonly batchSize: number;
  readonly currentBatch?: number;
  readonly requestedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly error?: string;
  readonly targets: readonly FirmwareCampaignTarget[];
}

export type FirmwareCampaignRecord = FirmwareCampaign;
