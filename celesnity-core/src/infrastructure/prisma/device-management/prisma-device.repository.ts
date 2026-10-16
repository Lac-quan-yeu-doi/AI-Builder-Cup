import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@generated/prisma/client';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type {
  DeviceListFilter,
  DeviceConfigurationTargetFilter,
  DeviceReconcileCandidate,
  IDeviceRepository,
  MeasurementPointInput,
} from '@application/device-management/interfaces/i-device.repository';
import type {
  Device,
  DeviceAdapterContext,
  DeviceAlert,
  DeviceAlertStatus,
  DeviceDesiredState,
  DeviceLifecycleState,
  DeviceLifecycleTransition,
  DeviceRecord,
} from '@domain/device-management/models/device';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const SELECTION = {
  id: true,
  organizationId: true,
  publicKey: true,
  adapterId: true,
  externalDeviceId: true,
  deviceType: true,
  name: true,
  model: true,
  hardwareRevision: true,
  currentFirmwareVersion: true,
  deploymentSite: true,
  physicalLocation: true,
  commissionedAt: true,
  provisioningConfirmedAt: true,
  lifecycleState: true,
  gatewayId: true,
  measurementPointId: true,
  telemetryTopic: true,
  firmwareEventsTopic: true,
  firmwareCommandsTopic: true,
  qos: true,
  encryptedCredentialPayload: true,
  encryptionIv: true,
  encryptionAuthTag: true,
  encryptionKeyVersion: true,
  desiredState: true,
  status: true,
  generation: true,
  observedGeneration: true,
  desiredConfigurationVersion: true,
  appliedConfigurationVersion: true,
  reportedConfigurationVersion: true,
  expectedCheckInIntervalSeconds: true,
  missedCheckInThreshold: true,
  contactStatus: true,
  contactDeadlineAt: true,
  contactLostAt: true,
  lastSeenAt: true,
  lastError: true,
  lastReconciledAt: true,
  reconcileAfter: true,
  reconciliationFailures: true,
  createdAt: true,
  updatedAt: true,
  adapter: {
    select: {
      publicKey: true,
      brokerUrl: true,
      tenantId: true,
      tenant: { select: { storageKey: true } },
    },
  },
  gateway: { select: { name: true } },
  measurementPoint: { select: { externalKey: true } },
} as const;

type RecordShape = Prisma.DeviceGetPayload<{ select: typeof SELECTION }>;

const ALERT_SELECTION = {
  id: true,
  organizationId: true,
  deviceId: true,
  sourceEventId: true,
  type: true,
  severity: true,
  status: true,
  snapshot: true,
  raisedAt: true,
  acknowledgedAt: true,
  acknowledgedBy: true,
  clearedAt: true,
  clearedBy: true,
  updatedAt: true,
  device: { select: { name: true } },
} as const;

type AlertShape = Prisma.DeviceAlertGetPayload<{ select: typeof ALERT_SELECTION }>;

@Injectable()
export class PrismaDeviceRepository implements IDeviceRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public async findAdapterContext(adapterId: string): Promise<DeviceAdapterContext | undefined> {
    const adapter = await this.prisma.client.mqttStreamAdapter.findUnique({
      where: { id: adapterId },
      select: {
        id: true,
        organizationId: true,
        publicKey: true,
        tenantId: true,
        brokerUrl: true,
        qos: true,
        status: true,
        desiredState: true,
        tenant: { select: { storageKey: true } },
      },
    });
    if (adapter === null) return undefined;
    return {
      id: adapter.id,
      organizationId: adapter.organizationId,
      publicKey: adapter.publicKey,
      tenantId: adapter.tenantId,
      tenantStorageKey: adapter.tenant.storageKey,
      brokerUrl: adapter.brokerUrl,
      qos: adapter.qos as 0 | 1 | 2,
      active: adapter.status === 'ACTIVE' && adapter.desiredState === 'ACTIVE',
    };
  }

  public async list(filter: DeviceListFilter): Promise<readonly Device[]> {
    const records = await this.prisma.client.device.findMany({
      where: {
        adapterId: filter.adapterId,
        ...(filter.status === undefined
          ? { desiredState: { not: 'RETIRED' as const } }
          : { status: filter.status }),
        ...(filter.deviceType === undefined ? {} : { deviceType: filter.deviceType }),
        ...(filter.lifecycleState === undefined ? {} : { lifecycleState: filter.lifecycleState }),
        ...(filter.search === undefined
          ? {}
          : {
              OR: [
                { externalDeviceId: { contains: filter.search, mode: 'insensitive' } },
                { name: { contains: filter.search, mode: 'insensitive' } },
                { model: { contains: filter.search, mode: 'insensitive' } },
              ],
            }),
      },
      select: SELECTION,
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => withoutCredentials(toRecord(record)));
  }

  public async findById(id: string): Promise<DeviceRecord | undefined> {
    const record = await this.prisma.client.device.findUnique({ where: { id }, select: SELECTION });
    return record === null ? undefined : toRecord(record);
  }

  public async findByPublicKey(publicKey: string): Promise<DeviceRecord | undefined> {
    const record = await this.prisma.client.device.findUnique({
      where: { publicKey },
      select: SELECTION,
    });
    return record === null ? undefined : toRecord(record);
  }

  public async isEligibleGateway(id: string, adapterId: string): Promise<boolean> {
    const gateway = await this.prisma.client.device.findFirst({
      where: {
        id,
        adapterId,
        deviceType: 'GATEWAY',
        lifecycleState: { not: 'DECOMMISSIONED' },
        desiredState: { not: 'RETIRED' },
      },
      select: { id: true },
    });
    return gateway !== null;
  }

  public async listBoundActiveSensorTelemetryTopics(gatewayId: string): Promise<readonly string[]> {
    const sensors = await this.prisma.client.device.findMany({
      where: {
        gatewayId,
        deviceType: 'SENSOR',
        desiredState: 'ACTIVE',
        lifecycleState: 'COMMISSIONED',
      },
      select: { telemetryTopic: true },
      orderBy: { telemetryTopic: 'asc' },
    });
    return sensors.map((sensor) => sensor.telemetryTopic);
  }

  public async listConfigurationTargets(
    filter: DeviceConfigurationTargetFilter,
  ): Promise<readonly DeviceRecord[]> {
    const devices = await this.prisma.client.device.findMany({
      where: {
        desiredState: 'ACTIVE',
        status: 'ACTIVE',
        lifecycleState: 'COMMISSIONED',
        ...(filter.deploymentSite === undefined
          ? {}
          : { deploymentSite: { equals: filter.deploymentSite, mode: 'insensitive' } }),
        ...(filter.deviceType === undefined ? {} : { deviceType: filter.deviceType }),
      },
      select: SELECTION,
      orderBy: { id: 'asc' },
    });
    return devices.map(toRecord);
  }

  public async schedulePrincipalReconciliation(id: string, now: string): Promise<void> {
    await this.prisma.client.device.updateMany({
      where: {
        id,
        deviceType: 'GATEWAY',
        desiredState: 'ACTIVE',
        status: { not: 'RETIRED' },
      },
      data: {
        status: 'PROVISIONING',
        generation: { increment: 1 },
        lastError: null,
        reconcileAfter: new Date(now),
        reconciliationFailures: 0,
        updatedAt: new Date(now),
      },
    });
  }

  public async createMeasurementPoint(
    input: MeasurementPointInput,
  ): Promise<'CREATED' | 'ID_CONFLICT'> {
    try {
      await this.prisma.client.measurementPoint.create({
        data: {
          id: input.id,
          organizationId: this.contexts.require().organizationId,
          adapterId: input.adapterId,
          externalKey: input.externalKey,
          name: input.name,
          deploymentSite: input.deploymentSite,
          physicalLocation: input.physicalLocation,
          createdAt: new Date(input.createdAt),
          updatedAt: new Date(input.createdAt),
        },
      });
      return 'CREATED';
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) return 'ID_CONFLICT';
      throw error;
    }
  }

  public async create(device: DeviceRecord): Promise<DeviceRecord | 'ID_CONFLICT'> {
    try {
      const created = await this.prisma.client.device.create({
        data: {
          id: device.id,
          organizationId: device.organizationId,
          publicKey: device.publicKey,
          adapterId: device.adapterId,
          externalDeviceId: device.externalDeviceId,
          deviceType: device.deviceType,
          name: device.name,
          model: device.model,
          hardwareRevision: device.hardwareRevision,
          currentFirmwareVersion: device.currentFirmwareVersion,
          deploymentSite: device.deploymentSite,
          physicalLocation: device.physicalLocation,
          commissionedAt:
            device.commissionedAt === undefined ? undefined : new Date(device.commissionedAt),
          provisioningConfirmedAt:
            device.provisioningConfirmedAt === undefined
              ? undefined
              : new Date(device.provisioningConfirmedAt),
          lifecycleState: device.lifecycleState,
          gatewayId: device.gatewayId,
          measurementPointId: device.measurementPointId,
          telemetryTopic: device.topics.telemetry,
          firmwareEventsTopic: device.topics.firmwareEvents,
          firmwareCommandsTopic: device.topics.firmwareCommands,
          qos: device.qos,
          encryptedCredentialPayload: device.credentials.ciphertext,
          encryptionIv: device.credentials.initializationVector,
          encryptionAuthTag: device.credentials.authenticationTag,
          encryptionKeyVersion: device.credentials.keyVersion,
          desiredState: device.desiredState,
          status: device.status,
          generation: device.generation,
          observedGeneration: device.observedGeneration,
          desiredConfigurationVersion: device.desiredConfigurationVersion,
          appliedConfigurationVersion: device.appliedConfigurationVersion,
          reportedConfigurationVersion: device.reportedConfigurationVersion,
          expectedCheckInIntervalSeconds: device.expectedCheckInIntervalSeconds,
          missedCheckInThreshold: device.missedCheckInThreshold,
          contactStatus: device.contactStatus,
          contactDeadlineAt:
            device.contactDeadlineAt === undefined ? undefined : new Date(device.contactDeadlineAt),
          contactLostAt:
            device.contactLostAt === undefined ? undefined : new Date(device.contactLostAt),
          createdAt: new Date(device.createdAt),
          updatedAt: new Date(device.updatedAt),
        },
        select: SELECTION,
      });
      return toRecord(created);
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) return 'ID_CONFLICT';
      throw error;
    }
  }

  public async updateDetails(
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
  ): Promise<DeviceRecord | undefined> {
    const result = await this.prisma.client.device.updateMany({
      where: { id, status: { not: 'RETIRED' } },
      data: {
        name: details.name,
        model: details.model,
        hardwareRevision: details.hardwareRevision ?? null,
        currentFirmwareVersion: details.currentFirmwareVersion ?? null,
        deploymentSite: details.deploymentSite ?? null,
        physicalLocation: details.physicalLocation ?? null,
        updatedAt: new Date(updatedAt),
      },
    });
    return result.count === 0 ? undefined : this.findById(id);
  }

  public async setDesiredState(
    id: string,
    desiredState: DeviceDesiredState,
    updatedAt: string,
  ): Promise<DeviceRecord | undefined> {
    const result = await this.prisma.client.device.updateMany({
      where: { id, status: { not: 'RETIRED' } },
      data: {
        desiredState,
        status: 'PROVISIONING',
        generation: { increment: 1 },
        lastError: null,
        reconcileAfter: new Date(updatedAt),
        reconciliationFailures: 0,
        updatedAt: new Date(updatedAt),
      },
    });
    return result.count === 0 ? undefined : this.findById(id);
  }

  public async replaceCredentials(
    id: string,
    credentials: DeviceRecord['credentials'],
    updatedAt: string,
  ): Promise<DeviceRecord | undefined> {
    const result = await this.prisma.client.device.updateMany({
      where: { id, status: { not: 'RETIRED' } },
      data: {
        encryptedCredentialPayload: credentials.ciphertext,
        encryptionIv: credentials.initializationVector,
        encryptionAuthTag: credentials.authenticationTag,
        encryptionKeyVersion: credentials.keyVersion,
        status: 'PROVISIONING',
        generation: { increment: 1 },
        lastError: null,
        reconcileAfter: new Date(updatedAt),
        reconciliationFailures: 0,
        updatedAt: new Date(updatedAt),
      },
    });
    return result.count === 0 ? undefined : this.findById(id);
  }

  public async transitionLifecycle(
    id: string,
    state: DeviceLifecycleState,
    transitionedAt: string,
    provisioningConfirmed: boolean,
    contactDeadlineAt?: string,
  ): Promise<DeviceRecord | undefined> {
    const result = await this.prisma.client.device.updateMany({
      where: { id, lifecycleState: { not: 'DECOMMISSIONED' } },
      data: {
        lifecycleState: state,
        ...(state === 'COMMISSIONED' ? { commissionedAt: new Date(transitionedAt) } : {}),
        ...(provisioningConfirmed ? { provisioningConfirmedAt: new Date(transitionedAt) } : {}),
        ...(contactDeadlineAt === undefined
          ? {}
          : { contactDeadlineAt: new Date(contactDeadlineAt) }),
        updatedAt: new Date(transitionedAt),
      },
    });
    return result.count === 0 ? undefined : this.findById(id);
  }

  public async recordLifecycleTransition(transition: DeviceLifecycleTransition): Promise<void> {
    await this.prisma.client.deviceLifecycleTransition.create({
      data: {
        id: transition.id,
        organizationId: this.contexts.require().organizationId,
        deviceId: transition.deviceId,
        fromState: transition.fromState,
        toState: transition.toState,
        operatorId: transition.operatorId,
        reason: transition.reason,
        transitionedAt: new Date(transition.transitionedAt),
      },
    });
  }

  public async listLifecycleTransitions(
    deviceId: string,
  ): Promise<readonly DeviceLifecycleTransition[]> {
    const records = await this.prisma.client.deviceLifecycleTransition.findMany({
      where: { deviceId },
      orderBy: { transitionedAt: 'desc' },
    });
    return records.map((record) => ({
      id: record.id,
      deviceId: record.deviceId,
      ...(record.fromState === null ? {} : { fromState: record.fromState }),
      toState: record.toState,
      operatorId: record.operatorId,
      ...(record.reason === null ? {} : { reason: record.reason }),
      transitionedAt: record.transitionedAt.toISOString(),
    }));
  }

  public async recordCheckIn(
    id: string,
    observedAt: string,
    contactDeadlineAt: string,
    currentFirmwareVersion?: string,
    reportedConfigurationVersion?: number,
  ): Promise<DeviceRecord | undefined> {
    const result = await this.prisma.client.device.updateMany({
      where: { id, lifecycleState: { not: 'DECOMMISSIONED' } },
      data: {
        lastSeenAt: new Date(observedAt),
        contactStatus: 'ONLINE',
        contactDeadlineAt: new Date(contactDeadlineAt),
        contactLostAt: null,
        ...(currentFirmwareVersion === undefined ? {} : { currentFirmwareVersion }),
        ...(reportedConfigurationVersion === undefined ? {} : { reportedConfigurationVersion }),
        updatedAt: new Date(observedAt),
      },
    });
    return result.count === 0 ? undefined : this.findById(id);
  }

  public async findLostContactCandidates(
    limit: number,
    now: string,
  ): Promise<readonly DeviceRecord[]> {
    const rows = await this.prisma.client.device.findMany({
      where: {
        desiredState: 'ACTIVE',
        status: 'ACTIVE',
        lifecycleState: 'COMMISSIONED',
        contactStatus: { in: ['NEVER_SEEN', 'ONLINE'] },
        contactDeadlineAt: { lte: new Date(now) },
      },
      select: SELECTION,
      orderBy: { contactDeadlineAt: 'asc' },
      take: limit,
    });
    return rows.map(toRecord);
  }

  public async markLostContact(
    id: string,
    expectedDeadline: string,
    now: string,
  ): Promise<DeviceRecord | undefined> {
    const result = await this.prisma.client.device.updateMany({
      where: {
        id,
        contactStatus: { in: ['NEVER_SEEN', 'ONLINE'] },
        contactDeadlineAt: new Date(expectedDeadline),
      },
      data: { contactStatus: 'LOST_CONTACT', contactLostAt: new Date(now) },
    });
    return result.count === 0 ? undefined : this.findById(id);
  }

  public async createAlert(alert: DeviceAlert): Promise<DeviceAlert | 'ACTIVE_ALERT_CONFLICT'> {
    try {
      const row = await this.prisma.client.deviceAlert.create({
        data: {
          id: alert.id,
          organizationId: alert.organizationId,
          deviceId: alert.deviceId,
          sourceEventId: alert.sourceEventId,
          type: alert.type,
          severity: alert.severity,
          status: alert.status,
          snapshot: alert.snapshot as Prisma.InputJsonObject,
          raisedAt: new Date(alert.raisedAt),
          updatedAt: new Date(alert.updatedAt),
        },
        select: ALERT_SELECTION,
      });
      return toAlert(row);
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        return 'ACTIVE_ALERT_CONFLICT';
      }
      throw error;
    }
  }

  public async listAlerts(
    filter: Readonly<{ deviceId?: string; status?: DeviceAlertStatus }>,
  ): Promise<readonly DeviceAlert[]> {
    const rows = await this.prisma.client.deviceAlert.findMany({
      where: {
        ...(filter.deviceId === undefined ? {} : { deviceId: filter.deviceId }),
        ...(filter.status === undefined ? {} : { status: filter.status }),
      },
      select: ALERT_SELECTION,
      orderBy: { raisedAt: 'desc' },
    });
    return rows.map(toAlert);
  }

  public async findAlert(id: string): Promise<DeviceAlert | undefined> {
    const row = await this.prisma.client.deviceAlert.findUnique({
      where: { id },
      select: ALERT_SELECTION,
    });
    return row === null ? undefined : toAlert(row);
  }

  public async findAlertBySourceEventId(sourceEventId: string): Promise<DeviceAlert | undefined> {
    const row = await this.prisma.client.deviceAlert.findFirst({
      where: { sourceEventId },
      select: ALERT_SELECTION,
    });
    return row === null ? undefined : toAlert(row);
  }

  public async findActiveAlert(
    deviceId: string,
    type: DeviceAlert['type'],
  ): Promise<DeviceAlert | undefined> {
    const row = await this.prisma.client.deviceAlert.findFirst({
      where: { deviceId, type, status: { not: 'CLEARED' } },
      select: ALERT_SELECTION,
      orderBy: { raisedAt: 'desc' },
    });
    return row === null ? undefined : toAlert(row);
  }

  public async updateAlertStatus(
    id: string,
    expectedStatus: DeviceAlertStatus,
    status: DeviceAlertStatus,
    operatorId: string,
    now: string,
  ): Promise<DeviceAlert | undefined> {
    const timestamp = new Date(now);
    const result = await this.prisma.client.deviceAlert.updateMany({
      where: { id, status: expectedStatus },
      data: {
        status,
        updatedAt: timestamp,
        ...(status === 'ACKNOWLEDGED'
          ? { acknowledgedAt: timestamp, acknowledgedBy: operatorId }
          : {}),
        ...(status === 'CLEARED' ? { clearedAt: timestamp, clearedBy: operatorId } : {}),
      },
    });
    return result.count === 0 ? undefined : this.findAlert(id);
  }

  public async clearActiveLossOfContactAlert(
    deviceId: string,
    operatorId: string,
    now: string,
  ): Promise<void> {
    await this.prisma.client.deviceAlert.updateMany({
      where: { deviceId, type: 'LOSS_OF_CONTACT', status: { in: ['RAISED', 'ACKNOWLEDGED'] } },
      data: {
        status: 'CLEARED',
        clearedAt: new Date(now),
        clearedBy: operatorId,
        updatedAt: new Date(now),
      },
    });
  }

  public async claimReconciliation(
    limit: number,
    now: string,
  ): Promise<DeviceReconcileCandidate[]> {
    const records = await this.prisma.client.device.findMany({
      where: {
        status: { in: ['PROVISIONING', 'DEGRADED', 'FAILED'] },
        reconcileAfter: { lte: new Date(now) },
      },
      select: SELECTION,
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    const candidates: DeviceReconcileCandidate[] = [];
    for (const record of records) {
      const attemptId = randomUUID();
      await this.contexts.runBackground(
        record.organizationId,
        () =>
          this.prisma.client.deviceProvisioningAttempt.create({
            data: {
              id: attemptId,
              organizationId: record.organizationId,
              deviceId: record.id,
              generation: record.generation,
              status: 'RUNNING',
              startedAt: new Date(now),
            },
          }),
        'DEVICES',
      );
      candidates.push({ ...toRecord(record), attemptId });
    }
    return candidates;
  }

  public async completeReconciliation(
    deviceId: string,
    generation: number,
    attemptId: string,
    now: string,
  ): Promise<void> {
    const device = await this.prisma.client.device.findUnique({ where: { id: deviceId } });
    if (device !== null && device.generation === generation) {
      await this.prisma.client.device.update({
        where: { id: deviceId },
        data: {
          observedGeneration: generation,
          status: statusFor(device.desiredState),
          lastError: null,
          lastReconciledAt: new Date(now),
          reconcileAfter: new Date(now),
          reconciliationFailures: 0,
        },
      });
    }
    await this.prisma.client.deviceProvisioningAttempt.update({
      where: { id: attemptId },
      data: { status: 'SUCCEEDED', finishedAt: new Date(now) },
    });
  }

  public async failReconciliation(
    deviceId: string,
    generation: number,
    attemptId: string,
    error: string,
    now: string,
  ): Promise<void> {
    const current = await this.prisma.client.device.findUnique({
      where: { id: deviceId },
      select: { reconciliationFailures: true },
    });
    const failures = (current?.reconciliationFailures ?? 0) + 1;
    const retryDelayMilliseconds = Math.min(300_000, 1_000 * 2 ** Math.min(failures, 8));
    await this.prisma.client.device.updateMany({
      where: { id: deviceId, generation },
      data: {
        status: failures >= 10 ? 'FAILED' : 'DEGRADED',
        lastError: error,
        lastReconciledAt: new Date(now),
        reconcileAfter: new Date(new Date(now).getTime() + retryDelayMilliseconds),
        reconciliationFailures: failures,
      },
    });
    await this.prisma.client.deviceProvisioningAttempt.update({
      where: { id: attemptId },
      data: { status: 'FAILED', error, finishedAt: new Date(now) },
    });
  }
}

function toRecord(record: RecordShape): DeviceRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    publicKey: record.publicKey,
    adapterId: record.adapterId,
    adapterKey: record.adapter.publicKey,
    tenantId: record.adapter.tenantId,
    tenantStorageKey: record.adapter.tenant.storageKey,
    externalDeviceId: record.externalDeviceId,
    deviceType: record.deviceType,
    name: record.name,
    model: record.model,
    ...(record.hardwareRevision === null ? {} : { hardwareRevision: record.hardwareRevision }),
    ...(record.currentFirmwareVersion === null
      ? {}
      : { currentFirmwareVersion: record.currentFirmwareVersion }),
    ...(record.deploymentSite === null ? {} : { deploymentSite: record.deploymentSite }),
    ...(record.physicalLocation === null ? {} : { physicalLocation: record.physicalLocation }),
    ...(record.commissionedAt === null
      ? {}
      : { commissionedAt: record.commissionedAt.toISOString() }),
    ...(record.provisioningConfirmedAt === null
      ? {}
      : { provisioningConfirmedAt: record.provisioningConfirmedAt.toISOString() }),
    lifecycleState: record.lifecycleState,
    ...(record.gatewayId === null ? {} : { gatewayId: record.gatewayId }),
    ...(record.gateway === null ? {} : { gatewayName: record.gateway.name }),
    ...(record.measurementPointId === null
      ? {}
      : { measurementPointId: record.measurementPointId }),
    ...(record.measurementPoint === null
      ? {}
      : { measurementPointKey: record.measurementPoint.externalKey }),
    brokerUrl: record.adapter.brokerUrl,
    topics: {
      telemetry: record.telemetryTopic,
      firmwareEvents: record.firmwareEventsTopic,
      firmwareCommands: record.firmwareCommandsTopic,
    },
    qos: record.qos as 0 | 1 | 2,
    credentials: {
      ciphertext: record.encryptedCredentialPayload,
      initializationVector: record.encryptionIv,
      authenticationTag: record.encryptionAuthTag,
      keyVersion: record.encryptionKeyVersion,
    },
    desiredState: record.desiredState,
    status: record.status,
    generation: record.generation,
    observedGeneration: record.observedGeneration,
    desiredConfigurationVersion: record.desiredConfigurationVersion,
    appliedConfigurationVersion: record.appliedConfigurationVersion,
    reportedConfigurationVersion: record.reportedConfigurationVersion,
    expectedCheckInIntervalSeconds: record.expectedCheckInIntervalSeconds,
    missedCheckInThreshold: record.missedCheckInThreshold,
    contactStatus: record.contactStatus,
    ...(record.contactDeadlineAt === null
      ? {}
      : { contactDeadlineAt: record.contactDeadlineAt.toISOString() }),
    ...(record.contactLostAt === null ? {} : { contactLostAt: record.contactLostAt.toISOString() }),
    ...(record.lastSeenAt === null ? {} : { lastSeenAt: record.lastSeenAt.toISOString() }),
    ...(record.lastError === null ? {} : { lastError: record.lastError }),
    ...(record.lastReconciledAt === null
      ? {}
      : { lastReconciledAt: record.lastReconciledAt.toISOString() }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toAlert(record: AlertShape): DeviceAlert {
  return {
    id: record.id,
    organizationId: record.organizationId,
    deviceId: record.deviceId,
    deviceName: record.device.name,
    ...(record.sourceEventId === null ? {} : { sourceEventId: record.sourceEventId }),
    type: record.type,
    severity: record.severity,
    status: record.status,
    snapshot: decodeSnapshot(record.snapshot),
    raisedAt: record.raisedAt.toISOString(),
    ...(record.acknowledgedAt === null
      ? {}
      : { acknowledgedAt: record.acknowledgedAt.toISOString() }),
    ...(record.acknowledgedBy === null ? {} : { acknowledgedBy: record.acknowledgedBy }),
    ...(record.clearedAt === null ? {} : { clearedAt: record.clearedAt.toISOString() }),
    ...(record.clearedBy === null ? {} : { clearedBy: record.clearedBy }),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function decodeSnapshot(value: Prisma.JsonValue): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Device alert snapshot must be a JSON object.');
  }
  return value;
}

function withoutCredentials(record: DeviceRecord): Device {
  const { credentials, ...device } = record;
  void credentials;
  return device;
}

function statusFor(desired: DeviceDesiredState): 'ACTIVE' | 'SUSPENDED' | 'RETIRED' {
  if (desired === 'ACTIVE') return 'ACTIVE';
  if (desired === 'SUSPENDED') return 'SUSPENDED';
  return 'RETIRED';
}
