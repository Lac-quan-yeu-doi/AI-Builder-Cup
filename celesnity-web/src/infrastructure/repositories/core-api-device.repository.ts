import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type {
  Device,
  DeviceAlert,
  DeviceAlertStatus,
  DeviceLogEntry,
  DeviceLogKind,
  DeviceLogLevel,
  DeviceAdapterOption,
  DeviceRegistration,
  DeviceConfiguration,
  DeviceConfigurationParameters,
  DeviceConfigurationStatus,
  DeviceLifecycleState,
  DeviceLifecycleTransition,
  DeviceStatus,
  CreateFirmwareReleaseInput,
  CreateFirmwareCampaignInput,
  FirmwareCampaign,
  FirmwareCampaignAction,
  FirmwareCampaignStatus,
  FirmwareCampaignTarget,
  FirmwareDeployment,
  FirmwareDeploymentStatus,
  FirmwareRelease,
  RegisterDeviceInput,
  ReplaceDeviceInput,
  PushDeviceConfigurationInput,
  CreateDeviceConfigurationTemplateInput,
  DeployDeviceConfigurationTemplateInput,
  DeviceConfigurationTemplate,
  DeviceConfigurationTemplateDeployment,
  TransitionDeviceLifecycleInput,
} from '@/src/entities/models/device';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

type DeviceDto = components['schemas']['DeviceResponseDto'];
type RegistrationDto = components['schemas']['DeviceRegistrationResponseDto'];
type RegisterDto = components['schemas']['RegisterDeviceRequestDto'];
type TransitionLifecycleDto = components['schemas']['TransitionDeviceLifecycleRequestDto'];
type ReplaceDto = components['schemas']['ReplaceDeviceRequestDto'];
type LifecycleTransitionDto = components['schemas']['DeviceLifecycleTransitionResponseDto'];
type AdapterDto = components['schemas']['MqttStreamAdapterResponseDto'];
type DeviceAlertDto = components['schemas']['DeviceAlertResponseDto'];
type DeviceLogDto = components['schemas']['DeviceLogResponseDto'];
type DeviceConfigurationTemplateDto =
  components['schemas']['DeviceConfigurationTemplateResponseDto'];
type DeviceConfigurationTemplateDeploymentDto =
  components['schemas']['DeviceConfigurationTemplateDeploymentResponseDto'];
type FirmwareCampaignDto = components['schemas']['FirmwareCampaignResponseDto'];
type DeviceDtoWithConfiguration = DeviceDto & {
  readonly desiredConfigurationVersion: number;
  readonly appliedConfigurationVersion: number;
  readonly reportedConfigurationVersion: number;
};

interface DeviceConfigurationDto {
  readonly id: string;
  readonly deviceId: string;
  readonly version: number;
  readonly status: string;
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

interface FirmwareReleaseDto {
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

interface FirmwareDeploymentDto {
  readonly id: string;
  readonly deviceId: string;
  readonly releaseId: string;
  readonly releaseVersion: string;
  readonly status: string;
  readonly progressPercent: number;
  readonly previousVersion?: string;
  readonly error?: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
}

export class CoreApiDeviceRepository implements DeviceRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listAdapters(): Promise<readonly DeviceAdapterOption[]> {
    const adapters = await this.request<readonly AdapterDto[]>('/streaming/mqtt-adapters', {
      method: 'GET',
    });
    return adapters.map((adapter) => ({
      id: adapter.id,
      name: adapter.name,
      adapterKey: adapter.adapterKey,
      tenantStorageKey: adapter.tenantStorageKey,
      active: adapter.status === 'ACTIVE' && adapter.desiredState === 'ACTIVE',
    }));
  }

  public async list(adapterId: string): Promise<readonly Device[]> {
    const devices = await this.request<readonly DeviceDto[]>(
      `/device-management/devices?adapterId=${encodeURIComponent(adapterId)}`,
      { method: 'GET' },
    );
    return devices.map(mapDevice);
  }

  public async register(input: RegisterDeviceInput): Promise<DeviceRegistration> {
    const body: RegisterDto = {
      adapterId: input.adapterId,
      externalDeviceId: input.externalDeviceId,
      deviceType: input.deviceType,
      name: input.name,
      model: input.model,
      ...(input.hardwareRevision === undefined ? {} : { hardwareRevision: input.hardwareRevision }),
      ...(input.currentFirmwareVersion === undefined
        ? {}
        : { currentFirmwareVersion: input.currentFirmwareVersion }),
      ...(input.deploymentSite === undefined ? {} : { deploymentSite: input.deploymentSite }),
      ...(input.physicalLocation === undefined ? {} : { physicalLocation: input.physicalLocation }),
      ...(input.gatewayId === undefined ? {} : { gatewayId: input.gatewayId }),
      ...(input.measurementPointKey === undefined
        ? {}
        : { measurementPointKey: input.measurementPointKey }),
      ...(input.measurementPointName === undefined
        ? {}
        : { measurementPointName: input.measurementPointName }),
      expectedCheckInIntervalSeconds: input.expectedCheckInIntervalSeconds ?? 60,
      missedCheckInThreshold: input.missedCheckInThreshold ?? 3,
    };
    return mapRegistration(
      await this.request<RegistrationDto>('/device-management/devices', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  }

  public async transitionLifecycle(input: TransitionDeviceLifecycleInput): Promise<Device> {
    const body: TransitionLifecycleDto = {
      state: input.state,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    };
    return mapDevice(
      await this.request<DeviceDto>(`${devicePath(input.id)}/lifecycle-transitions`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  }

  public async listLifecycleTransitions(id: string): Promise<readonly DeviceLifecycleTransition[]> {
    const transitions = await this.request<readonly LifecycleTransitionDto[]>(
      `${devicePath(id)}/lifecycle-transitions`,
      { method: 'GET' },
    );
    return transitions.map(mapLifecycleTransition);
  }

  public async replace(input: ReplaceDeviceInput): Promise<DeviceRegistration> {
    const body: ReplaceDto = {
      externalDeviceId: input.externalDeviceId,
      name: input.name,
      model: input.model,
      ...(input.hardwareRevision === undefined ? {} : { hardwareRevision: input.hardwareRevision }),
      ...(input.currentFirmwareVersion === undefined
        ? {}
        : { currentFirmwareVersion: input.currentFirmwareVersion }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    };
    return mapRegistration(
      await this.request<RegistrationDto>(`${devicePath(input.id)}/replacements`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  }

  public async activate(id: string): Promise<Device> {
    return mapDevice(
      await this.request<DeviceDto>(`${devicePath(id)}/activate`, { method: 'POST' }),
    );
  }

  public async suspend(id: string): Promise<Device> {
    return mapDevice(
      await this.request<DeviceDto>(`${devicePath(id)}/suspend`, { method: 'POST' }),
    );
  }

  public async rotateCredential(id: string): Promise<DeviceRegistration> {
    return mapRegistration(
      await this.request<RegistrationDto>(`${devicePath(id)}/credentials`, { method: 'POST' }),
    );
  }

  public retire(id: string): Promise<void> {
    return this.request<void>(devicePath(id), { method: 'DELETE' });
  }

  public async listFirmwareReleases(): Promise<readonly FirmwareRelease[]> {
    const releases = await this.request<readonly FirmwareReleaseDto[]>(
      '/device-management/firmware-releases',
      { method: 'GET' },
    );
    return releases.map(mapFirmwareRelease);
  }

  public async createFirmwareRelease(input: CreateFirmwareReleaseInput): Promise<FirmwareRelease> {
    const body = new FormData();
    body.set('file', input.file, input.file.name);
    body.set('version', input.version);
    body.set('deviceModel', input.deviceModel);
    if (input.hardwareRevision !== undefined) body.set('hardwareRevision', input.hardwareRevision);
    if (input.releaseNotes !== undefined) body.set('releaseNotes', input.releaseNotes);
    return mapFirmwareRelease(
      await this.request<FirmwareReleaseDto>('/device-management/firmware-releases/upload', {
        method: 'POST',
        body,
      }),
    );
  }

  public async listFirmwareDeployments(deviceId: string): Promise<readonly FirmwareDeployment[]> {
    const deployments = await this.request<readonly FirmwareDeploymentDto[]>(
      `${devicePath(deviceId)}/firmware-deployments`,
      { method: 'GET' },
    );
    return deployments.map(mapFirmwareDeployment);
  }

  public async startFirmwareDeployment(
    deviceId: string,
    releaseId: string,
  ): Promise<FirmwareDeployment> {
    return mapFirmwareDeployment(
      await this.request<FirmwareDeploymentDto>(`${devicePath(deviceId)}/firmware-deployments`, {
        method: 'POST',
        body: JSON.stringify({ releaseId }),
      }),
    );
  }

  public async createFirmwareCampaign(
    input: CreateFirmwareCampaignInput,
  ): Promise<FirmwareCampaign> {
    return mapFirmwareCampaign(
      await this.request<FirmwareCampaignDto>('/device-management/firmware-campaigns', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  }

  public async listFirmwareCampaigns(): Promise<readonly FirmwareCampaign[]> {
    const campaigns = await this.request<readonly FirmwareCampaignDto[]>(
      '/device-management/firmware-campaigns',
      { method: 'GET' },
    );
    return campaigns.map(mapFirmwareCampaign);
  }

  public async transitionFirmwareCampaign(
    id: string,
    action: FirmwareCampaignAction,
  ): Promise<FirmwareCampaign> {
    return mapFirmwareCampaign(
      await this.request<FirmwareCampaignDto>(
        `/device-management/firmware-campaigns/${encodeURIComponent(id)}/${action}`,
        { method: 'POST' },
      ),
    );
  }

  public async listAlerts(status?: DeviceAlertStatus): Promise<readonly DeviceAlert[]> {
    const query = status === undefined ? '' : `?status=${encodeURIComponent(status)}`;
    const alerts = await this.request<readonly DeviceAlertDto[]>(
      `/device-management/device-alerts${query}`,
      { method: 'GET' },
    );
    return alerts.map(mapDeviceAlert);
  }

  public async acknowledgeAlert(id: string): Promise<DeviceAlert> {
    return mapDeviceAlert(
      await this.request<DeviceAlertDto>(
        `/device-management/device-alerts/${encodeURIComponent(id)}/acknowledgements`,
        { method: 'POST' },
      ),
    );
  }

  public async clearAlert(id: string): Promise<DeviceAlert> {
    return mapDeviceAlert(
      await this.request<DeviceAlertDto>(
        `/device-management/device-alerts/${encodeURIComponent(id)}/clearances`,
        { method: 'POST' },
      ),
    );
  }

  public async listLogs(
    deviceId: string,
    filter: Readonly<{ level?: DeviceLogLevel; kind?: DeviceLogKind; limit?: number }> = {},
  ): Promise<readonly DeviceLogEntry[]> {
    const query = new URLSearchParams();
    if (filter.level !== undefined) query.set('level', filter.level);
    if (filter.kind !== undefined) query.set('kind', filter.kind);
    if (filter.limit !== undefined) query.set('limit', String(filter.limit));
    const suffix = query.size === 0 ? '' : `?${query.toString()}`;
    const logs = await this.request<readonly DeviceLogDto[]>(
      `${devicePath(deviceId)}/logs${suffix}`,
      {
        method: 'GET',
      },
    );
    return logs.map(mapDeviceLog);
  }

  public async listConfigurations(deviceId: string): Promise<readonly DeviceConfiguration[]> {
    const configurations = await this.request<readonly DeviceConfigurationDto[]>(
      `${devicePath(deviceId)}/configurations`,
      { method: 'GET' },
    );
    return configurations.map(mapDeviceConfiguration);
  }

  public async pushConfiguration(
    input: PushDeviceConfigurationInput,
  ): Promise<DeviceConfiguration> {
    return mapDeviceConfiguration(
      await this.request<DeviceConfigurationDto>(`${devicePath(input.deviceId)}/configurations`, {
        method: 'POST',
        body: JSON.stringify({
          ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
          ...(input.restoreFactoryDefaults === undefined
            ? {}
            : { restoreFactoryDefaults: input.restoreFactoryDefaults }),
        }),
      }),
    );
  }

  public async createConfigurationTemplate(
    input: CreateDeviceConfigurationTemplateInput,
  ): Promise<DeviceConfigurationTemplate> {
    return mapDeviceConfigurationTemplate(
      await this.request<DeviceConfigurationTemplateDto>(
        '/device-management/device-configuration-templates',
        { method: 'POST', body: JSON.stringify(input) },
      ),
    );
  }

  public async listConfigurationTemplates(): Promise<readonly DeviceConfigurationTemplate[]> {
    const templates = await this.request<readonly DeviceConfigurationTemplateDto[]>(
      '/device-management/device-configuration-templates',
      { method: 'GET' },
    );
    return templates.map(mapDeviceConfigurationTemplate);
  }

  public async deployConfigurationTemplate(
    input: DeployDeviceConfigurationTemplateInput,
  ): Promise<DeviceConfigurationTemplateDeployment> {
    const { templateId, ...target } = input;
    return mapDeviceConfigurationTemplateDeployment(
      await this.request<DeviceConfigurationTemplateDeploymentDto>(
        `/device-management/device-configuration-templates/${encodeURIComponent(templateId)}/deployments`,
        { method: 'POST', body: JSON.stringify(target) },
      ),
    );
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapFirmwareRelease(dto: FirmwareReleaseDto): FirmwareRelease {
  return {
    ...dto,
    ...(dto.hardwareRevision === undefined ? {} : { hardwareRevision: dto.hardwareRevision }),
    ...(dto.releaseNotes === undefined ? {} : { releaseNotes: dto.releaseNotes }),
  };
}

function mapFirmwareDeployment(dto: FirmwareDeploymentDto): FirmwareDeployment {
  return {
    ...dto,
    status: decodeFirmwareDeploymentStatus(dto.status),
  };
}

function mapFirmwareCampaign(dto: FirmwareCampaignDto): FirmwareCampaign {
  return {
    id: dto.id,
    name: dto.name,
    releaseId: dto.releaseId,
    releaseVersion: dto.releaseVersion,
    status: decodeFirmwareCampaignStatus(dto.status),
    canarySize: dto.canarySize,
    batchSize: dto.batchSize,
    ...(dto.currentBatch === undefined ? {} : { currentBatch: dto.currentBatch }),
    requestedBy: dto.requestedBy,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    ...(dto.error === undefined ? {} : { error: dto.error }),
    targets: dto.targets.map(mapFirmwareCampaignTarget),
  };
}

function mapFirmwareCampaignTarget(
  dto: FirmwareCampaignDto['targets'][number],
): FirmwareCampaignTarget {
  return {
    id: dto.id,
    deviceId: dto.deviceId,
    deviceName: dto.deviceName,
    batchNumber: dto.batchNumber,
    ...(dto.deploymentId === undefined ? {} : { deploymentId: dto.deploymentId }),
    status: dto.status === 'PENDING' ? 'PENDING' : decodeFirmwareDeploymentStatus(dto.status),
    progressPercent: dto.progressPercent,
    ...(dto.error === undefined ? {} : { error: dto.error }),
    updatedAt: dto.updatedAt,
  };
}

function decodeFirmwareCampaignStatus(value: string): FirmwareCampaignStatus {
  if (
    value === 'DRAFT' ||
    value === 'RUNNING' ||
    value === 'PAUSED' ||
    value === 'COMPLETED' ||
    value === 'ABORTED'
  ) {
    return value;
  }
  throw new Error('Core API returned an invalid firmware campaign status.');
}

function decodeFirmwareDeploymentStatus(value: string): FirmwareDeploymentStatus {
  const statuses: readonly FirmwareDeploymentStatus[] = [
    'QUEUED',
    'DISPATCHED',
    'ACCEPTED',
    'DOWNLOADING',
    'VERIFYING',
    'INSTALLING',
    'REBOOTING',
    'SUCCEEDED',
    'FAILED',
    'ROLLED_BACK',
    'CANCELLED',
  ];
  if (statuses.includes(value as FirmwareDeploymentStatus))
    return value as FirmwareDeploymentStatus;
  throw new Error('Core API returned an invalid firmware deployment status.');
}

function devicePath(id: string): string {
  return `/device-management/devices/${encodeURIComponent(id)}`;
}

function mapDevice(dto: DeviceDto): Device {
  const configuration = dto as DeviceDtoWithConfiguration;
  return {
    id: dto.id,
    deviceKey: dto.deviceKey,
    adapterId: dto.adapterId,
    adapterKey: dto.adapterKey,
    tenantStorageKey: dto.tenantStorageKey,
    externalDeviceId: dto.externalDeviceId,
    deviceType: decodeDeviceType(dto.deviceType),
    name: dto.name,
    model: dto.model,
    ...(dto.hardwareRevision === undefined ? {} : { hardwareRevision: dto.hardwareRevision }),
    ...(dto.currentFirmwareVersion === undefined
      ? {}
      : { currentFirmwareVersion: dto.currentFirmwareVersion }),
    ...(dto.deploymentSite === undefined ? {} : { deploymentSite: dto.deploymentSite }),
    ...(dto.physicalLocation === undefined ? {} : { physicalLocation: dto.physicalLocation }),
    ...(dto.commissionedAt === undefined ? {} : { commissionedAt: dto.commissionedAt }),
    ...(dto.provisioningConfirmedAt === undefined
      ? {}
      : { provisioningConfirmedAt: dto.provisioningConfirmedAt }),
    lifecycleState: decodeLifecycleState(dto.lifecycleState),
    ...(dto.gatewayId === undefined ? {} : { gatewayId: dto.gatewayId }),
    ...(dto.gatewayName === undefined ? {} : { gatewayName: dto.gatewayName }),
    ...(dto.measurementPointId === undefined ? {} : { measurementPointId: dto.measurementPointId }),
    ...(dto.measurementPointKey === undefined
      ? {}
      : { measurementPointKey: dto.measurementPointKey }),
    brokerUrl: dto.brokerUrl,
    topics: { ...dto.topics },
    qos: decodeQos(dto.qos),
    desiredState: decodeDesiredState(dto.desiredState),
    status: decodeStatus(dto.status),
    generation: dto.generation,
    observedGeneration: dto.observedGeneration,
    desiredConfigurationVersion: configuration.desiredConfigurationVersion,
    appliedConfigurationVersion: configuration.appliedConfigurationVersion,
    reportedConfigurationVersion: configuration.reportedConfigurationVersion,
    expectedCheckInIntervalSeconds: dto.expectedCheckInIntervalSeconds,
    missedCheckInThreshold: dto.missedCheckInThreshold,
    contactStatus: decodeContactStatus(dto.contactStatus),
    ...(dto.contactDeadlineAt === undefined ? {} : { contactDeadlineAt: dto.contactDeadlineAt }),
    ...(dto.contactLostAt === undefined ? {} : { contactLostAt: dto.contactLostAt }),
    ...(dto.lastSeenAt === undefined ? {} : { lastSeenAt: dto.lastSeenAt }),
    ...(dto.lastError === undefined ? {} : { lastError: dto.lastError }),
    updatedAt: dto.updatedAt,
  };
}

function mapDeviceConfiguration(dto: DeviceConfigurationDto): DeviceConfiguration {
  return {
    ...dto,
    status: decodeDeviceConfigurationStatus(dto.status),
    parameters: { ...dto.parameters },
  };
}

function mapDeviceConfigurationTemplate(
  dto: DeviceConfigurationTemplateDto,
): DeviceConfigurationTemplate {
  return { ...dto, parameters: { ...dto.parameters } };
}

function mapDeviceConfigurationTemplateDeployment(
  dto: DeviceConfigurationTemplateDeploymentDto,
): DeviceConfigurationTemplateDeployment {
  return {
    template: mapDeviceConfigurationTemplate(dto.template),
    targetCount: dto.targetCount,
    configurations: dto.configurations.map(mapDeviceConfiguration),
    failures: dto.failures.map((failure) => ({ ...failure })),
  };
}

function decodeDeviceConfigurationStatus(value: string): DeviceConfigurationStatus {
  const statuses: readonly DeviceConfigurationStatus[] = [
    'QUEUED',
    'DISPATCHED',
    'APPLIED',
    'FAILED',
    'ROLLED_BACK',
  ];
  if (statuses.includes(value as DeviceConfigurationStatus)) {
    return value as DeviceConfigurationStatus;
  }
  throw new Error('Core API returned an invalid device configuration status.');
}

function mapDeviceAlert(dto: DeviceAlertDto): DeviceAlert {
  return {
    id: dto.id,
    deviceId: dto.deviceId,
    deviceName: dto.deviceName,
    ...(dto.sourceEventId === undefined ? {} : { sourceEventId: dto.sourceEventId }),
    type: decodeAlertType(dto.type),
    severity: decodeAlertSeverity(dto.severity),
    status: decodeAlertStatus(dto.status),
    snapshot: { ...dto.snapshot },
    raisedAt: dto.raisedAt,
    ...(dto.acknowledgedAt === undefined ? {} : { acknowledgedAt: dto.acknowledgedAt }),
    ...(dto.acknowledgedBy === undefined ? {} : { acknowledgedBy: dto.acknowledgedBy }),
    ...(dto.clearedAt === undefined ? {} : { clearedAt: dto.clearedAt }),
    ...(dto.clearedBy === undefined ? {} : { clearedBy: dto.clearedBy }),
    updatedAt: dto.updatedAt,
  };
}

function mapDeviceLog(dto: DeviceLogDto): DeviceLogEntry {
  return {
    id: dto.id,
    deviceId: dto.deviceId,
    deviceName: dto.deviceName,
    sourceEventId: dto.sourceEventId,
    level: decodeDeviceLogLevel(dto.level),
    kind: decodeDeviceLogKind(dto.kind),
    message: dto.message,
    context: { ...dto.context },
    observedAt: dto.observedAt,
    receivedAt: dto.receivedAt,
  };
}

function decodeDeviceLogLevel(value: string): DeviceLogLevel {
  if (value === 'ERROR' || value === 'WARNING' || value === 'INFO' || value === 'DEBUG') {
    return value;
  }
  throw new Error('Core API returned an invalid device log level.');
}

function decodeDeviceLogKind(value: string): DeviceLogKind {
  if (value === 'OPERATIONAL' || value === 'FAULT') return value;
  throw new Error('Core API returned an invalid device log kind.');
}

function decodeContactStatus(value: string): Device['contactStatus'] {
  if (value === 'NEVER_SEEN' || value === 'ONLINE' || value === 'LOST_CONTACT') return value;
  throw new Error('Core API returned an invalid device contact status.');
}

function decodeAlertType(value: string): DeviceAlert['type'] {
  if (
    value === 'LOSS_OF_CONTACT' ||
    value === 'STORAGE_ALMOST_FULL' ||
    value === 'SIM_DATA_LIMIT' ||
    value === 'BATTERY_LOW' ||
    value === 'TAMPER' ||
    value === 'SHOCK' ||
    value === 'MOVED' ||
    value === 'SENSOR_FAULT' ||
    value === 'UNEXPECTED_REBOOT' ||
    value === 'RADIO_DEGRADED' ||
    value === 'LTE_MODEM_FAILURE'
  ) {
    return value;
  }
  throw new Error('Core API returned an invalid device alert type.');
}

function decodeAlertSeverity(value: string): DeviceAlert['severity'] {
  if (value === 'INFO' || value === 'WARNING' || value === 'CRITICAL') return value;
  throw new Error('Core API returned an invalid device alert severity.');
}

function decodeAlertStatus(value: string): DeviceAlertStatus {
  if (value === 'RAISED' || value === 'ACKNOWLEDGED' || value === 'CLEARED') return value;
  throw new Error('Core API returned an invalid device alert status.');
}

function mapLifecycleTransition(dto: LifecycleTransitionDto): DeviceLifecycleTransition {
  return {
    id: dto.id,
    deviceId: dto.deviceId,
    ...(dto.fromState === undefined ? {} : { fromState: decodeLifecycleState(dto.fromState) }),
    toState: decodeLifecycleState(dto.toState),
    operatorId: dto.operatorId,
    ...(dto.reason === undefined ? {} : { reason: dto.reason }),
    transitionedAt: dto.transitionedAt,
  };
}

function decodeDeviceType(value: string): Device['deviceType'] {
  if (value === 'GATEWAY' || value === 'SENSOR') return value;
  throw new Error('Core API returned an invalid device type.');
}

function decodeLifecycleState(value: string): DeviceLifecycleState {
  if (
    value === 'MANUFACTURED' ||
    value === 'PROVISIONED' ||
    value === 'COMMISSIONED' ||
    value === 'DECOMMISSIONED'
  ) {
    return value;
  }
  throw new Error('Core API returned an invalid device lifecycle state.');
}

function mapRegistration(dto: RegistrationDto): DeviceRegistration {
  return {
    device: mapDevice(dto.device),
    credential: { ...dto.credential },
  };
}

function decodeQos(value: number): 0 | 1 | 2 {
  if (value === 0 || value === 1 || value === 2) return value;
  throw new Error('Core API returned an invalid device QoS.');
}

function decodeDesiredState(value: string): Device['desiredState'] {
  if (value === 'ACTIVE' || value === 'SUSPENDED' || value === 'RETIRED') return value;
  throw new Error('Core API returned an invalid device desired state.');
}

function decodeStatus(value: string): DeviceStatus {
  if (
    value === 'PROVISIONING' ||
    value === 'ACTIVE' ||
    value === 'DEGRADED' ||
    value === 'SUSPENDED' ||
    value === 'FAILED' ||
    value === 'RETIRED'
  ) {
    return value;
  }
  throw new Error('Core API returned an invalid device status.');
}
