export type DeviceConfigurationStatus =
  'QUEUED' | 'DISPATCHED' | 'APPLIED' | 'FAILED' | 'ROLLED_BACK';

export type GatewayUplinkMode = 'MQTT' | 'BULK_HTTP';
export type DiagnosticMetric =
  'CPU_LOAD' | 'CPU_TEMPERATURE' | 'MEMORY' | 'BATTERY_PERCENT' | 'RSSI_SNR' | 'UPTIME';

export interface DeviceConfigurationParameters {
  readonly samplingRateHz?: number;
  readonly reportingIntervalSeconds?: number;
  readonly channels?: Readonly<Record<string, boolean>>;
  readonly gatewayUplinkMode?: GatewayUplinkMode;
  readonly diagnosticLogging?: readonly DiagnosticMetric[];
  readonly logLevel?: 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';
  readonly alertThresholds?: Readonly<Record<string, number>>;
}

export interface DeviceConfiguration {
  readonly id: string;
  readonly organizationId: string;
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

export interface DeviceConfigurationRecord extends DeviceConfiguration {
  readonly eventTokenHash: string;
}

export interface DeviceConfigurationTemplate {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly version: number;
  readonly parameters: DeviceConfigurationParameters;
  readonly createdBy: string;
  readonly createdAt: string;
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

export interface DeviceConfigurationCommand {
  readonly configurationId: string;
  readonly version: number;
  readonly parameters: DeviceConfigurationParameters;
  readonly restoreFactoryDefaults: boolean;
  readonly previousAppliedVersion: number;
  readonly eventPath: string;
  readonly eventToken: string;
}
