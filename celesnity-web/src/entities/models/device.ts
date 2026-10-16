export type DeviceStatus =
  'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'SUSPENDED' | 'FAILED' | 'RETIRED';
export type DeviceType = 'GATEWAY' | 'SENSOR';
export type DeviceContactStatus = 'NEVER_SEEN' | 'ONLINE' | 'LOST_CONTACT';
export type DeviceLifecycleState =
  'MANUFACTURED' | 'PROVISIONED' | 'COMMISSIONED' | 'DECOMMISSIONED';

export interface DeviceTopics {
  readonly telemetry: string;
  readonly firmwareEvents: string;
  readonly firmwareCommands: string;
}

export interface Device {
  readonly id: string;
  readonly deviceKey: string;
  readonly adapterId: string;
  readonly adapterKey: string;
  readonly tenantStorageKey: string;
  readonly externalDeviceId: string;
  readonly deviceType: DeviceType;
  readonly name: string;
  readonly model: string;
  readonly hardwareRevision?: string;
  readonly currentFirmwareVersion?: string;
  readonly deploymentSite?: string;
  readonly physicalLocation?: string;
  readonly commissionedAt?: string;
  readonly provisioningConfirmedAt?: string;
  readonly lifecycleState: DeviceLifecycleState;
  readonly gatewayId?: string;
  readonly gatewayName?: string;
  readonly measurementPointId?: string;
  readonly measurementPointKey?: string;
  readonly brokerUrl: string;
  readonly topics: DeviceTopics;
  readonly qos: 0 | 1 | 2;
  readonly desiredState: 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
  readonly status: DeviceStatus;
  readonly generation: number;
  readonly observedGeneration: number;
  readonly desiredConfigurationVersion: number;
  readonly appliedConfigurationVersion: number;
  readonly reportedConfigurationVersion: number;
  readonly expectedCheckInIntervalSeconds: number;
  readonly missedCheckInThreshold: number;
  readonly contactStatus: DeviceContactStatus;
  readonly contactDeadlineAt?: string;
  readonly contactLostAt?: string;
  readonly lastSeenAt?: string;
  readonly lastError?: string;
  readonly updatedAt: string;
}

export type DeviceAlertStatus = 'RAISED' | 'ACKNOWLEDGED' | 'CLEARED';
export type DeviceAlertType =
  | 'LOSS_OF_CONTACT'
  | 'STORAGE_ALMOST_FULL'
  | 'SIM_DATA_LIMIT'
  | 'BATTERY_LOW'
  | 'TAMPER'
  | 'SHOCK'
  | 'MOVED'
  | 'SENSOR_FAULT'
  | 'UNEXPECTED_REBOOT'
  | 'RADIO_DEGRADED'
  | 'LTE_MODEM_FAILURE';

export interface DeviceAlert {
  readonly id: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly sourceEventId?: string;
  readonly type: DeviceAlertType;
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
  readonly status: DeviceAlertStatus;
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly raisedAt: string;
  readonly acknowledgedAt?: string;
  readonly acknowledgedBy?: string;
  readonly clearedAt?: string;
  readonly clearedBy?: string;
  readonly updatedAt: string;
}

export type DeviceLogLevel = 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';
export type DeviceLogKind = 'OPERATIONAL' | 'FAULT';

export interface DeviceLogEntry {
  readonly id: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly sourceEventId: string;
  readonly level: DeviceLogLevel;
  readonly kind: DeviceLogKind;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly observedAt: string;
  readonly receivedAt: string;
}

export interface DeviceAdapterOption {
  readonly id: string;
  readonly name: string;
  readonly adapterKey: string;
  readonly tenantStorageKey: string;
  readonly active: boolean;
}

export interface RegisterDeviceInput {
  readonly adapterId: string;
  readonly externalDeviceId: string;
  readonly deviceType: DeviceType;
  readonly name: string;
  readonly model: string;
  readonly hardwareRevision?: string;
  readonly currentFirmwareVersion?: string;
  readonly deploymentSite?: string;
  readonly physicalLocation?: string;
  readonly gatewayId?: string;
  readonly measurementPointKey?: string;
  readonly measurementPointName?: string;
  readonly expectedCheckInIntervalSeconds?: number;
  readonly missedCheckInThreshold?: number;
}

export interface TransitionDeviceLifecycleInput {
  readonly id: string;
  readonly state: Exclude<DeviceLifecycleState, 'MANUFACTURED'>;
  readonly reason?: string;
}

export interface ReplaceDeviceInput {
  readonly id: string;
  readonly externalDeviceId: string;
  readonly name: string;
  readonly model: string;
  readonly hardwareRevision?: string;
  readonly currentFirmwareVersion?: string;
  readonly reason?: string;
}

export interface DeviceLifecycleTransition {
  readonly id: string;
  readonly deviceId: string;
  readonly fromState?: DeviceLifecycleState;
  readonly toState: DeviceLifecycleState;
  readonly operatorId: string;
  readonly reason?: string;
  readonly transitionedAt: string;
}

export interface IssuedDeviceCredential {
  readonly username: string;
  readonly password: string;
}

export interface DeviceRegistration {
  readonly device: Device;
  readonly credential: IssuedDeviceCredential;
}

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
  readonly version: string;
  readonly deviceModel: string;
  readonly hardwareRevision?: string;
  readonly artifactUrl?: string;
  readonly artifactStorageProvider?: 'MINIO' | 'GCS';
  readonly artifactFileName?: string;
  readonly artifactContentType?: string;
  readonly artifactSizeBytes?: number;
  readonly sha256: string;
  readonly signature: string;
  readonly signingKeyId?: string;
  readonly signatureVerifiedAt?: string;
  readonly releaseNotes?: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CreateFirmwareReleaseInput {
  readonly version: string;
  readonly deviceModel: string;
  readonly hardwareRevision?: string;
  readonly file: File;
  readonly releaseNotes?: string;
}

export interface FirmwareDeployment {
  readonly id: string;
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

export type FirmwareCampaignStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ABORTED';
export type FirmwareCampaignAction = 'start' | 'advance' | 'pause' | 'resume' | 'abort';

export interface FirmwareCampaignTarget {
  readonly id: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly batchNumber: number;
  readonly deploymentId?: string;
  readonly status: 'PENDING' | FirmwareDeploymentStatus;
  readonly progressPercent: number;
  readonly error?: string;
  readonly updatedAt: string;
}

export interface FirmwareCampaign {
  readonly id: string;
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

export interface CreateFirmwareCampaignInput {
  readonly name: string;
  readonly releaseId: string;
  readonly deviceIds: readonly string[];
  readonly canarySize: number;
  readonly batchSize: number;
}

export interface TransitionFirmwareCampaignInput {
  readonly id: string;
  readonly action: FirmwareCampaignAction;
}

export type DeviceConfigurationStatus =
  'QUEUED' | 'DISPATCHED' | 'APPLIED' | 'FAILED' | 'ROLLED_BACK';

export interface DeviceConfigurationParameters {
  readonly samplingRateHz?: number;
  readonly reportingIntervalSeconds?: number;
  readonly channels?: Readonly<Record<string, boolean>>;
  readonly gatewayUplinkMode?: 'MQTT' | 'BULK_HTTP';
  readonly diagnosticLogging?: readonly (
    'CPU_LOAD' | 'CPU_TEMPERATURE' | 'MEMORY' | 'BATTERY_PERCENT' | 'RSSI_SNR' | 'UPTIME'
  )[];
  readonly logLevel?: 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';
  readonly alertThresholds?: Readonly<Record<string, number>>;
}

export interface DeviceConfiguration {
  readonly id: string;
  readonly deviceId: string;
  readonly version: number;
  readonly status: DeviceConfigurationStatus;
  readonly parameters: DeviceConfigurationParameters;
  readonly restoreFactoryDefaults: boolean;
  readonly previousAppliedVersion: number;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly dispatchedAt?: string;
  readonly appliedAt?: string;
  readonly confirmedAt?: string;
  readonly finishedAt?: string;
  readonly error?: string;
  readonly updatedAt: string;
}

export interface PushDeviceConfigurationInput {
  readonly deviceId: string;
  readonly parameters?: DeviceConfigurationParameters;
  readonly restoreFactoryDefaults?: boolean;
}

export interface DeviceConfigurationTemplate {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly parameters: DeviceConfigurationParameters;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CreateDeviceConfigurationTemplateInput {
  readonly name: string;
  readonly parameters: DeviceConfigurationParameters;
}

export interface DeployDeviceConfigurationTemplateInput {
  readonly templateId: string;
  readonly deploymentSite?: string;
  readonly deviceType?: DeviceType;
}

export interface DeviceConfigurationDeploymentFailure {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly error: string;
}

export interface DeviceConfigurationTemplateDeployment {
  readonly template: DeviceConfigurationTemplate;
  readonly targetCount: number;
  readonly configurations: readonly DeviceConfiguration[];
  readonly failures: readonly DeviceConfigurationDeploymentFailure[];
}
