export type DeviceStatus =
  'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'SUSPENDED' | 'FAILED' | 'RETIRED';

export type DeviceDesiredState = 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
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
  readonly publicKey: string;
  readonly adapterId: string;
  readonly adapterKey: string;
  readonly tenantId: string;
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
  readonly desiredState: DeviceDesiredState;
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
  readonly lastReconciledAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type DeviceAlertStatus = 'RAISED' | 'ACKNOWLEDGED' | 'CLEARED';
export type DeviceAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
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
  readonly organizationId: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly sourceEventId?: string;
  readonly type: DeviceAlertType;
  readonly severity: DeviceAlertSeverity;
  readonly status: DeviceAlertStatus;
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly raisedAt: string;
  readonly acknowledgedAt?: string;
  readonly acknowledgedBy?: string;
  readonly clearedAt?: string;
  readonly clearedBy?: string;
  readonly updatedAt: string;
}

export interface DeviceHeartbeatPrincipal {
  readonly deviceId: string;
  readonly organizationId: string;
  readonly deviceType: DeviceType;
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

export interface StoredDeviceCredentials {
  readonly ciphertext: string;
  readonly initializationVector: string;
  readonly authenticationTag: string;
  readonly keyVersion: string;
}

export interface DeviceRecord extends Device {
  readonly organizationId: string;
  readonly credentials: StoredDeviceCredentials;
}

export interface IssuedDeviceCredential {
  readonly username: string;
  readonly password: string;
}

export interface DeviceRegistration {
  readonly device: Device;
  readonly credential: IssuedDeviceCredential;
}

export interface DeviceAdapterContext {
  readonly id: string;
  readonly organizationId: string;
  readonly publicKey: string;
  readonly tenantId: string;
  readonly tenantStorageKey: string;
  readonly brokerUrl: string;
  readonly qos: 0 | 1 | 2;
  readonly active: boolean;
}
