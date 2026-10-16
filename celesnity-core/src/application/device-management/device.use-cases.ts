import { timingSafeEqual } from 'node:crypto';

import type { IDeviceCredentialVault } from '@application/device-management/interfaces/i-device-credential-vault';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type {
  DeviceListFilter,
  IDeviceRepository,
} from '@application/device-management/interfaces/i-device.repository';
import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import type { IDeviceConfigurationRepository } from '@application/device-management/interfaces/i-device-configuration.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { IStreamingSecretGenerator } from '@application/streaming/interfaces/i-streaming-secret-generator';
import { DeviceError } from '@domain/device-management/errors/device.errors';
import type {
  Device,
  DeviceAlert,
  DeviceAlertStatus,
  DeviceAlertSeverity,
  DeviceAlertType,
  DeviceDesiredState,
  DeviceHeartbeatPrincipal,
  DeviceLifecycleState,
  DeviceLifecycleTransition,
  DeviceRecord,
  DeviceRegistration,
  DeviceType,
} from '@domain/device-management/models/device';

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
  readonly existingMeasurementPointId?: string;
  readonly expectedCheckInIntervalSeconds?: number;
  readonly missedCheckInThreshold?: number;
}

export interface UpdateDeviceInput {
  readonly name?: string;
  readonly model?: string;
  readonly hardwareRevision?: string;
  readonly currentFirmwareVersion?: string;
  readonly deploymentSite?: string;
  readonly physicalLocation?: string;
}

export interface TransitionDeviceLifecycleInput {
  readonly state: DeviceLifecycleState;
  readonly reason?: string;
}

export interface DeviceCheckInInput {
  readonly deviceId?: string;
  readonly observedAt?: string;
  readonly currentFirmwareVersion?: string;
  readonly configurationVersion?: number;
  readonly reportingGatewayId?: string;
}

export interface ReportDeviceAlertInput {
  readonly deviceId: string;
  readonly eventId: string;
  readonly type: DeviceAlertType;
  readonly severity: DeviceAlertSeverity;
  readonly observedAt: string;
  readonly snapshot: Readonly<Record<string, unknown>>;
}

export interface ReplaceDeviceInput {
  readonly externalDeviceId: string;
  readonly name: string;
  readonly model: string;
  readonly hardwareRevision?: string;
  readonly currentFirmwareVersion?: string;
  readonly reason?: string;
}

export class DeviceUseCases {
  public constructor(
    private readonly repository: IDeviceRepository,
    private readonly credentials: IDeviceCredentialVault,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly secrets: IStreamingSecretGenerator,
    private readonly contexts: AuthenticatedContextStore,
    private readonly firmware: IFirmwareRepository,
    private readonly configurations: IDeviceConfigurationRepository,
    private readonly defaultExpectedCheckInIntervalSeconds = 60,
    private readonly defaultMissedCheckInThreshold = 3,
  ) {}

  public list(filter: DeviceListFilter): Promise<readonly Device[]> {
    return this.repository.list({
      adapterId: filter.adapterId,
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.deviceType === undefined ? {} : { deviceType: filter.deviceType }),
      ...(filter.lifecycleState === undefined ? {} : { lifecycleState: filter.lifecycleState }),
      ...(filter.search === undefined ? {} : { search: cleanOptional(filter.search, 160) }),
    });
  }

  public async get(id: string): Promise<Device> {
    return withoutCredentials(await this.require(id));
  }

  public async register(input: RegisterDeviceInput): Promise<DeviceRegistration> {
    const adapter = await this.repository.findAdapterContext(input.adapterId);
    if (adapter === undefined || !adapter.active) throw DeviceError.adapterNotFound();
    const now = this.clock.now();
    const id = this.ids.next();
    const publicKey = `dev_${id.replaceAll('-', '')}`;
    const externalDeviceId = cleanDeviceId(input.externalDeviceId);
    const operatorId = this.contexts.require().identityId;
    if (input.deviceType === 'SENSOR') {
      if (input.gatewayId === undefined) {
        throw DeviceError.validation('A sensor must be bound to a gateway.');
      }
      if (!(await this.repository.isEligibleGateway(input.gatewayId, adapter.id))) {
        throw DeviceError.validation('The selected gateway is not active in this MQTT adapter.');
      }
    } else if (input.gatewayId !== undefined) {
      throw DeviceError.validation('A gateway cannot be bound to another gateway.');
    }
    const credential = { username: publicKey, password: this.secrets.generate() };
    const encrypted = await this.credentials.encrypt(credential);
    const topicBase = `tenants/${adapter.tenantStorageKey}/adapters/${adapter.publicKey}/devices/${id}`;
    const measurementPointId =
      input.deviceType === 'SENSOR'
        ? (input.existingMeasurementPointId ?? this.ids.next())
        : undefined;
    const measurementPointKey =
      input.deviceType === 'SENSOR'
        ? cleanDeviceId(input.measurementPointKey ?? externalDeviceId)
        : undefined;
    const record: DeviceRecord = {
      id,
      publicKey,
      adapterId: adapter.id,
      adapterKey: adapter.publicKey,
      tenantId: adapter.tenantId,
      organizationId: adapter.organizationId,
      tenantStorageKey: adapter.tenantStorageKey,
      externalDeviceId,
      deviceType: input.deviceType,
      name: cleanText(input.name, 'Device name', 160),
      model: cleanText(input.model, 'Device model', 120),
      ...(input.hardwareRevision === undefined
        ? {}
        : { hardwareRevision: cleanText(input.hardwareRevision, 'Hardware revision', 80) }),
      ...(input.currentFirmwareVersion === undefined
        ? {}
        : {
            currentFirmwareVersion: cleanText(
              input.currentFirmwareVersion,
              'Firmware version',
              120,
            ),
          }),
      ...(input.deploymentSite === undefined
        ? {}
        : { deploymentSite: cleanText(input.deploymentSite, 'Deployment site', 160) }),
      ...(input.physicalLocation === undefined
        ? {}
        : { physicalLocation: cleanText(input.physicalLocation, 'Physical location', 255) }),
      lifecycleState: 'MANUFACTURED',
      ...(input.gatewayId === undefined ? {} : { gatewayId: input.gatewayId }),
      ...(measurementPointId === undefined ? {} : { measurementPointId }),
      ...(measurementPointKey === undefined ? {} : { measurementPointKey }),
      brokerUrl: adapter.brokerUrl,
      topics: {
        telemetry: `${topicBase}/telemetry`,
        firmwareEvents: `${topicBase}/events/firmware`,
        firmwareCommands: `${topicBase}/commands/firmware`,
      },
      qos: adapter.qos,
      credentials: encrypted,
      desiredState: 'ACTIVE',
      status: 'PROVISIONING',
      generation: 1,
      observedGeneration: 0,
      desiredConfigurationVersion: 0,
      appliedConfigurationVersion: 0,
      reportedConfigurationVersion: 0,
      expectedCheckInIntervalSeconds: positiveInteger(
        input.expectedCheckInIntervalSeconds ?? this.defaultExpectedCheckInIntervalSeconds,
        'Expected check-in interval',
        86_400,
      ),
      missedCheckInThreshold: positiveInteger(
        input.missedCheckInThreshold ?? this.defaultMissedCheckInThreshold,
        'Missed check-in threshold',
        100,
      ),
      contactStatus: 'NEVER_SEEN',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    return this.unitOfWork.commit(async (events) => {
      if (
        measurementPointId !== undefined &&
        measurementPointKey !== undefined &&
        input.existingMeasurementPointId === undefined
      ) {
        const created = await this.repository.createMeasurementPoint({
          id: measurementPointId,
          adapterId: adapter.id,
          externalKey: measurementPointKey,
          name: cleanText(input.measurementPointName ?? input.name, 'Measurement point name', 160),
          ...(input.deploymentSite === undefined
            ? {}
            : { deploymentSite: cleanText(input.deploymentSite, 'Deployment site', 160) }),
          ...(input.physicalLocation === undefined
            ? {}
            : { physicalLocation: cleanText(input.physicalLocation, 'Physical location', 255) }),
          createdAt: now.toISOString(),
        });
        if (created === 'ID_CONFLICT') throw DeviceError.idConflict();
      }
      const saved = await this.repository.create(record);
      if (saved === 'ID_CONFLICT') throw DeviceError.idConflict();
      await this.repository.recordLifecycleTransition({
        id: this.ids.next(),
        deviceId: saved.id,
        toState: 'MANUFACTURED',
        operatorId,
        transitionedAt: now.toISOString(),
      });
      events.record({
        organizationId: saved.organizationId,
        id: this.ids.next(),
        aggregateType: 'Device',
        aggregateId: saved.id,
        eventName: 'DeviceRegistered',
        occurredAt: now,
        payload: eventPayload(saved),
      });
      return { device: withoutCredentials(saved), credential };
    });
  }

  public async update(id: string, input: UpdateDeviceInput): Promise<Device> {
    const current = await this.require(id);
    const updated = await this.repository.updateDetails(
      id,
      {
        name: input.name === undefined ? current.name : cleanText(input.name, 'Device name', 160),
        model:
          input.model === undefined ? current.model : cleanText(input.model, 'Device model', 120),
        ...(input.hardwareRevision === undefined
          ? current.hardwareRevision === undefined
            ? {}
            : { hardwareRevision: current.hardwareRevision }
          : { hardwareRevision: cleanText(input.hardwareRevision, 'Hardware revision', 80) }),
        ...(input.currentFirmwareVersion === undefined
          ? current.currentFirmwareVersion === undefined
            ? {}
            : { currentFirmwareVersion: current.currentFirmwareVersion }
          : {
              currentFirmwareVersion: cleanText(
                input.currentFirmwareVersion,
                'Firmware version',
                120,
              ),
            }),
        ...(input.deploymentSite === undefined
          ? current.deploymentSite === undefined
            ? {}
            : { deploymentSite: current.deploymentSite }
          : { deploymentSite: cleanText(input.deploymentSite, 'Deployment site', 160) }),
        ...(input.physicalLocation === undefined
          ? current.physicalLocation === undefined
            ? {}
            : { physicalLocation: current.physicalLocation }
          : { physicalLocation: cleanText(input.physicalLocation, 'Physical location', 255) }),
      },
      this.clock.now().toISOString(),
    );
    if (updated === undefined) throw DeviceError.notFound();
    return withoutCredentials(updated);
  }

  public activate(id: string): Promise<Device> {
    return this.changeDesiredState(id, 'ACTIVE', 'DeviceActivationRequested');
  }

  public suspend(id: string): Promise<Device> {
    return this.changeDesiredState(id, 'SUSPENDED', 'DeviceSuspensionRequested');
  }

  public async retire(id: string): Promise<void> {
    await this.changeDesiredState(id, 'RETIRED', 'DeviceRetirementRequested');
  }

  public async rotateCredentials(id: string): Promise<DeviceRegistration> {
    const current = await this.require(id);
    const now = this.clock.now();
    const credential = { username: current.publicKey, password: this.secrets.generate() };
    const encrypted = await this.credentials.encrypt(credential);
    return this.unitOfWork.commit(async (events) => {
      const updated = await this.repository.replaceCredentials(id, encrypted, now.toISOString());
      if (updated === undefined) throw DeviceError.notFound();
      events.record({
        organizationId: updated.organizationId,
        id: this.ids.next(),
        aggregateType: 'Device',
        aggregateId: updated.id,
        eventName: 'DeviceCredentialsRotated',
        occurredAt: now,
        payload: eventPayload(updated),
      });
      return { device: withoutCredentials(updated), credential };
    });
  }

  public async listLifecycleTransitions(id: string): Promise<readonly DeviceLifecycleTransition[]> {
    await this.require(id);
    return this.repository.listLifecycleTransitions(id);
  }

  public async confirmProvisioning(id: string): Promise<Device> {
    return this.transitionLifecycle(id, {
      state: 'PROVISIONED',
      reason: 'Factory flashing tool confirmed registration.',
    });
  }

  public async transitionLifecycle(
    id: string,
    input: TransitionDeviceLifecycleInput,
  ): Promise<Device> {
    const current = await this.require(id);
    if (!allowedLifecycleTransition(current.lifecycleState, input.state)) {
      throw DeviceError.stateConflict(
        `Device lifecycle cannot transition from ${current.lifecycleState} to ${input.state}.`,
      );
    }
    const now = this.clock.now();
    const operatorId = this.contexts.require().identityId;
    const reason =
      input.reason === undefined ? undefined : cleanText(input.reason, 'Transition reason', 500);
    return this.unitOfWork.commit(async (events) => {
      const updated = await this.repository.transitionLifecycle(
        id,
        input.state,
        now.toISOString(),
        input.state === 'PROVISIONED',
        input.state === 'COMMISSIONED'
          ? new Date(
              now.getTime() +
                current.expectedCheckInIntervalSeconds * current.missedCheckInThreshold * 1000,
            ).toISOString()
          : undefined,
      );
      if (updated === undefined) throw DeviceError.notFound();
      await this.repository.recordLifecycleTransition({
        id: this.ids.next(),
        deviceId: id,
        fromState: current.lifecycleState,
        toState: input.state,
        operatorId,
        ...(reason === undefined ? {} : { reason }),
        transitionedAt: now.toISOString(),
      });
      if (updated.deviceType === 'SENSOR' && updated.gatewayId !== undefined) {
        await this.repository.schedulePrincipalReconciliation(updated.gatewayId, now.toISOString());
      }
      events.record({
        organizationId: updated.organizationId,
        id: this.ids.next(),
        aggregateType: 'Device',
        aggregateId: id,
        eventName: 'DeviceLifecycleTransitioned',
        occurredAt: now,
        payload: {
          deviceId: id,
          fromState: current.lifecycleState,
          toState: input.state,
          operatorId,
        },
      });
      return withoutCredentials(updated);
    });
  }

  public async recordCheckIn(id: string, input: DeviceCheckInInput): Promise<Device> {
    const current = await this.require(id);
    if (current.deviceType === 'SENSOR' && input.reportingGatewayId !== current.gatewayId) {
      throw DeviceError.validation(
        'Sensor check-in was rejected because the gateway is not bound.',
      );
    }
    const observedAt = input.observedAt ?? this.clock.now().toISOString();
    if (Number.isNaN(Date.parse(observedAt))) {
      throw DeviceError.validation('Check-in timestamp must be an ISO-8601 date-time.');
    }
    return this.persistCheckIn(
      current,
      observedAt,
      input.currentFirmwareVersion,
      input.configurationVersion,
      `device:${id}`,
    );
  }

  public async authenticateHeartbeat(
    username: string,
    password: string,
  ): Promise<DeviceHeartbeatPrincipal | undefined> {
    const device = await this.repository.findByPublicKey(username.trim());
    if (device === undefined || device.deviceType !== 'GATEWAY' || device.desiredState !== 'ACTIVE')
      return undefined;
    const stored = await this.credentials.decrypt(device.credentials);
    if (!safeCredentialEqual(stored.password ?? '', password)) return undefined;
    return {
      deviceId: device.id,
      organizationId: device.organizationId,
      deviceType: device.deviceType,
    };
  }

  public recordAuthenticatedHeartbeat(
    principal: DeviceHeartbeatPrincipal,
    input: DeviceCheckInInput & { readonly deviceId: string },
  ): Promise<Device> {
    return this.contexts.runBackground(
      principal.organizationId,
      async () => {
        const target = await this.require(input.deviceId);
        if (target.desiredState !== 'ACTIVE' || target.lifecycleState !== 'COMMISSIONED') {
          throw DeviceError.validation('Heartbeat target must be commissioned and enabled.');
        }
        if (
          target.id !== principal.deviceId &&
          !(principal.deviceType === 'GATEWAY' && target.gatewayId === principal.deviceId)
        ) {
          throw DeviceError.validation('The authenticated gateway is not bound to this sensor.');
        }
        if (input.observedAt !== undefined && Number.isNaN(Date.parse(input.observedAt))) {
          throw DeviceError.validation('Heartbeat timestamp must be an ISO-8601 date-time.');
        }
        const receivedAt = this.clock.now().toISOString();
        return this.persistCheckIn(
          target,
          receivedAt,
          input.currentFirmwareVersion,
          input.configurationVersion,
          `device:${principal.deviceId}`,
          true,
        );
      },
      'DEVICES',
    );
  }

  public listAlerts(
    filter: Readonly<{ deviceId?: string; status?: DeviceAlertStatus }>,
  ): Promise<readonly DeviceAlert[]> {
    return this.repository.listAlerts(filter);
  }

  public reportAuthenticatedAlert(
    principal: DeviceHeartbeatPrincipal,
    input: ReportDeviceAlertInput,
  ): Promise<DeviceAlert> {
    return this.contexts.runBackground(
      principal.organizationId,
      async () => {
        const target = await this.require(input.deviceId);
        if (target.desiredState !== 'ACTIVE' || target.lifecycleState !== 'COMMISSIONED') {
          throw DeviceError.validation('Alert target must be commissioned and enabled.');
        }
        if (
          target.id !== principal.deviceId &&
          !(principal.deviceType === 'GATEWAY' && target.gatewayId === principal.deviceId)
        ) {
          throw DeviceError.validation('The authenticated gateway is not bound to this sensor.');
        }
        if (input.type === 'LOSS_OF_CONTACT') {
          throw DeviceError.validation('Loss-of-contact alerts can only be raised by the cloud.');
        }
        if (Number.isNaN(Date.parse(input.observedAt))) {
          throw DeviceError.validation('Alert timestamp must be an ISO-8601 date-time.');
        }
        const now = this.clock.now().toISOString();
        const created = await this.repository.createAlert({
          id: this.ids.next(),
          organizationId: target.organizationId,
          deviceId: target.id,
          deviceName: target.name,
          sourceEventId: input.eventId,
          type: input.type,
          severity: input.severity,
          status: 'RAISED',
          snapshot: { ...input.snapshot },
          raisedAt: new Date(input.observedAt).toISOString(),
          updatedAt: now,
        });
        if (created !== 'ACTIVE_ALERT_CONFLICT') return created;
        const existing =
          (await this.repository.findAlertBySourceEventId(input.eventId)) ??
          (await this.repository.findActiveAlert(target.id, input.type));
        if (existing === undefined) {
          throw DeviceError.stateConflict('The alert changed concurrently.');
        }
        return existing;
      },
      'DEVICES',
    );
  }

  public async acknowledgeAlert(id: string): Promise<DeviceAlert> {
    const current = await this.repository.findAlert(id);
    if (current === undefined) throw DeviceError.notFound();
    if (current.status !== 'RAISED') {
      throw DeviceError.stateConflict('Only a raised alert can be acknowledged.');
    }
    const updated = await this.repository.updateAlertStatus(
      id,
      'RAISED',
      'ACKNOWLEDGED',
      this.contexts.require().identityId,
      this.clock.now().toISOString(),
    );
    if (updated === undefined) throw DeviceError.stateConflict('The alert changed concurrently.');
    return updated;
  }

  public async clearAlert(id: string): Promise<DeviceAlert> {
    const current = await this.repository.findAlert(id);
    if (current === undefined) throw DeviceError.notFound();
    if (current.status === 'CLEARED')
      throw DeviceError.stateConflict('The alert is already cleared.');
    const updated = await this.repository.updateAlertStatus(
      id,
      current.status,
      'CLEARED',
      this.contexts.require().identityId,
      this.clock.now().toISOString(),
    );
    if (updated === undefined) throw DeviceError.stateConflict('The alert changed concurrently.');
    return updated;
  }

  public async replace(id: string, input: ReplaceDeviceInput): Promise<DeviceRegistration> {
    const current = await this.require(id);
    if (current.deviceType !== 'SENSOR' || current.measurementPointId === undefined) {
      throw DeviceError.stateConflict(
        'Only a sensor attached to a measurement point can be replaced.',
      );
    }
    if (current.lifecycleState !== 'COMMISSIONED') {
      throw DeviceError.stateConflict('A sensor must be commissioned before it can be replaced.');
    }
    const replacement = await this.register({
      adapterId: current.adapterId,
      externalDeviceId: input.externalDeviceId,
      deviceType: 'SENSOR',
      name: input.name,
      model: input.model,
      ...(input.hardwareRevision === undefined ? {} : { hardwareRevision: input.hardwareRevision }),
      ...(input.currentFirmwareVersion === undefined
        ? {}
        : { currentFirmwareVersion: input.currentFirmwareVersion }),
      ...(current.deploymentSite === undefined ? {} : { deploymentSite: current.deploymentSite }),
      ...(current.physicalLocation === undefined
        ? {}
        : { physicalLocation: current.physicalLocation }),
      ...(current.gatewayId === undefined ? {} : { gatewayId: current.gatewayId }),
      measurementPointKey: current.measurementPointKey,
      measurementPointName: current.name,
      existingMeasurementPointId: current.measurementPointId,
    });
    await this.transitionLifecycle(id, {
      state: 'DECOMMISSIONED',
      reason: input.reason ?? `Replaced by device ${replacement.device.id}.`,
    });
    return replacement;
  }

  private async changeDesiredState(
    id: string,
    desiredState: DeviceDesiredState,
    eventName: string,
  ): Promise<Device> {
    const current = await this.require(id);
    if (current.desiredState === 'RETIRED') {
      throw DeviceError.stateConflict('A retired device cannot change state.');
    }
    const now = this.clock.now();
    return this.unitOfWork.commit(async (events) => {
      const updated = await this.repository.setDesiredState(id, desiredState, now.toISOString());
      if (updated === undefined) throw DeviceError.notFound();
      events.record({
        organizationId: updated.organizationId,
        id: this.ids.next(),
        aggregateType: 'Device',
        aggregateId: updated.id,
        eventName,
        occurredAt: now,
        payload: eventPayload(updated),
      });
      return withoutCredentials(updated);
    });
  }

  private async persistCheckIn(
    current: DeviceRecord,
    observedAt: string,
    currentFirmwareVersion: string | undefined,
    configurationVersion: number | undefined,
    clearingOperatorId: string,
    confirmFirmwareBoot = false,
  ): Promise<Device> {
    const contactDeadlineAt = new Date(
      Date.parse(observedAt) +
        current.expectedCheckInIntervalSeconds * current.missedCheckInThreshold * 1000,
    ).toISOString();
    return this.unitOfWork.commit(async () => {
      const reportedFirmwareVersion =
        currentFirmwareVersion === undefined
          ? undefined
          : cleanText(currentFirmwareVersion, 'Firmware version', 120);
      const updated = await this.repository.recordCheckIn(
        current.id,
        observedAt,
        contactDeadlineAt,
        reportedFirmwareVersion,
        configurationVersion === undefined
          ? undefined
          : nonNegativeInteger(configurationVersion, 'Configuration version', 2_147_483_647),
      );
      if (updated === undefined) throw DeviceError.notFound();
      await this.repository.clearActiveLossOfContactAlert(
        current.id,
        clearingOperatorId,
        observedAt,
      );
      if (confirmFirmwareBoot && reportedFirmwareVersion !== undefined) {
        await this.firmware.confirmRebootedDeployment(
          current.id,
          reportedFirmwareVersion,
          observedAt,
        );
      }
      if (confirmFirmwareBoot && configurationVersion !== undefined) {
        await this.configurations.confirmApplied(current.id, configurationVersion, observedAt);
      }
      return withoutCredentials(updated);
    });
  }

  private async require(id: string): Promise<DeviceRecord> {
    const device = await this.repository.findById(id);
    if (device === undefined || device.status === 'RETIRED') throw DeviceError.notFound();
    return device;
  }
}

function allowedLifecycleTransition(from: DeviceLifecycleState, to: DeviceLifecycleState): boolean {
  const transitions: Readonly<Record<DeviceLifecycleState, readonly DeviceLifecycleState[]>> = {
    MANUFACTURED: ['PROVISIONED', 'DECOMMISSIONED'],
    PROVISIONED: ['COMMISSIONED', 'DECOMMISSIONED'],
    COMMISSIONED: ['DECOMMISSIONED'],
    DECOMMISSIONED: [],
  };
  return transitions[from].includes(to);
}

function eventPayload(device: DeviceRecord): Readonly<Record<string, unknown>> {
  return {
    deviceId: device.id,
    deviceKey: device.publicKey,
    adapterId: device.adapterId,
    externalDeviceId: device.externalDeviceId,
    desiredState: device.desiredState,
    generation: device.generation,
  };
}

function withoutCredentials(record: DeviceRecord): Device {
  const { credentials, organizationId, ...device } = record;
  void credentials;
  void organizationId;
  return device;
}

function cleanDeviceId(value: string): string {
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(cleaned)) {
    throw DeviceError.validation(
      'Device identifier must contain 1 to 128 letters, numbers, dots, underscores, colons, or hyphens.',
    );
  }
  return cleaned;
}

function cleanText(value: string, field: string, max: number): string {
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > max) {
    throw DeviceError.validation(`${field} must contain between 1 and ${max} characters.`);
  }
  return cleaned;
}

function cleanOptional(value: string, max: number): string | undefined {
  const cleaned = value.trim();
  if (cleaned.length === 0) return undefined;
  if (cleaned.length > max)
    throw DeviceError.validation(`Search must not exceed ${max} characters.`);
  return cleaned;
}

function positiveInteger(value: number, field: string, maximum: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw DeviceError.validation(`${field} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

function nonNegativeInteger(value: number, field: string, maximum: number): number {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw DeviceError.validation(`${field} must be an integer between 0 and ${maximum}.`);
  }
  return value;
}

function safeCredentialEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
