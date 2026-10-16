import type {
  Device,
  DeviceAdapterContext,
  DeviceAlert,
  DeviceAlertStatus,
  DeviceDesiredState,
  DeviceLifecycleState,
  DeviceLifecycleTransition,
  DeviceRecord,
  DeviceType,
} from '@domain/device-management/models/device';

export interface DeviceListFilter {
  readonly adapterId: string;
  readonly status?: Device['status'];
  readonly deviceType?: DeviceType;
  readonly lifecycleState?: DeviceLifecycleState;
  readonly search?: string;
}

export interface DeviceConfigurationTargetFilter {
  readonly deploymentSite?: string;
  readonly deviceType?: DeviceType;
}

export interface MeasurementPointInput {
  readonly id: string;
  readonly adapterId: string;
  readonly externalKey: string;
  readonly name: string;
  readonly deploymentSite?: string;
  readonly physicalLocation?: string;
  readonly createdAt: string;
}

export interface DeviceReconcileCandidate extends DeviceRecord {
  readonly attemptId: string;
}

export interface IDeviceRepository {
  findAdapterContext(adapterId: string): Promise<DeviceAdapterContext | undefined>;
  list(filter: DeviceListFilter): Promise<readonly Device[]>;
  findById(id: string): Promise<DeviceRecord | undefined>;
  findByPublicKey(publicKey: string): Promise<DeviceRecord | undefined>;
  isEligibleGateway(id: string, adapterId: string): Promise<boolean>;
  listBoundActiveSensorTelemetryTopics(gatewayId: string): Promise<readonly string[]>;
  listConfigurationTargets(
    filter: DeviceConfigurationTargetFilter,
  ): Promise<readonly DeviceRecord[]>;
  schedulePrincipalReconciliation(id: string, now: string): Promise<void>;
  createMeasurementPoint(input: MeasurementPointInput): Promise<'CREATED' | 'ID_CONFLICT'>;
  create(device: DeviceRecord): Promise<DeviceRecord | 'ID_CONFLICT'>;
  updateDetails(
    id: string,
    details: Readonly<{
      name: string;
      model: string;
      hardwareRevision?: string;
      currentFirmwareVersion?: string;
      deploymentSite?: string;
      physicalLocation?: string;
    }>,
    updatedAt: string,
  ): Promise<DeviceRecord | undefined>;
  setDesiredState(
    id: string,
    desiredState: DeviceDesiredState,
    updatedAt: string,
  ): Promise<DeviceRecord | undefined>;
  replaceCredentials(
    id: string,
    credentials: DeviceRecord['credentials'],
    updatedAt: string,
  ): Promise<DeviceRecord | undefined>;
  transitionLifecycle(
    id: string,
    state: DeviceLifecycleState,
    transitionedAt: string,
    provisioningConfirmed: boolean,
    contactDeadlineAt?: string,
  ): Promise<DeviceRecord | undefined>;
  recordLifecycleTransition(transition: DeviceLifecycleTransition): Promise<void>;
  listLifecycleTransitions(deviceId: string): Promise<readonly DeviceLifecycleTransition[]>;
  recordCheckIn(
    id: string,
    observedAt: string,
    contactDeadlineAt: string,
    currentFirmwareVersion?: string,
    reportedConfigurationVersion?: number,
  ): Promise<DeviceRecord | undefined>;
  findLostContactCandidates(limit: number, now: string): Promise<readonly DeviceRecord[]>;
  markLostContact(
    id: string,
    expectedDeadline: string,
    now: string,
  ): Promise<DeviceRecord | undefined>;
  createAlert(alert: DeviceAlert): Promise<DeviceAlert | 'ACTIVE_ALERT_CONFLICT'>;
  listAlerts(
    filter: Readonly<{ deviceId?: string; status?: DeviceAlertStatus }>,
  ): Promise<readonly DeviceAlert[]>;
  findAlert(id: string): Promise<DeviceAlert | undefined>;
  findAlertBySourceEventId(sourceEventId: string): Promise<DeviceAlert | undefined>;
  findActiveAlert(deviceId: string, type: DeviceAlert['type']): Promise<DeviceAlert | undefined>;
  updateAlertStatus(
    id: string,
    expectedStatus: DeviceAlertStatus,
    status: DeviceAlertStatus,
    operatorId: string,
    now: string,
  ): Promise<DeviceAlert | undefined>;
  clearActiveLossOfContactAlert(deviceId: string, operatorId: string, now: string): Promise<void>;
  claimReconciliation(limit: number, now: string): Promise<DeviceReconcileCandidate[]>;
  completeReconciliation(
    deviceId: string,
    generation: number,
    attemptId: string,
    now: string,
  ): Promise<void>;
  failReconciliation(
    deviceId: string,
    generation: number,
    attemptId: string,
    error: string,
    now: string,
  ): Promise<void>;
}
