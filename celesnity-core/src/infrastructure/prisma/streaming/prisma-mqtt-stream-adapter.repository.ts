import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@generated/prisma/client';

import type {
  IMqttStreamAdapterRepository,
  ReconcileCandidate,
  SaveAdapterInput,
} from '@application/streaming/interfaces/i-mqtt-stream-adapter.repository';
import type {
  MqttStreamAdapter,
  MqttStreamAdapterRecord,
  StreamAdapterDesiredState,
} from '@domain/streaming/models/mqtt-stream-adapter';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const SELECTION = {
  id: true,
  publicKey: true,
  tenantId: true,
  name: true,
  brokerUrl: true,
  topicFilter: true,
  qos: true,
  encryptedCredentialPayload: true,
  encryptionIv: true,
  encryptionAuthTag: true,
  encryptionKeyVersion: true,
  desiredState: true,
  status: true,
  placementKind: true,
  deploymentId: true,
  generation: true,
  observedGeneration: true,
  lastError: true,
  lastReconciledAt: true,
  reconcileAfter: true,
  reconciliationFailures: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { storageKey: true, displayName: true } },
} as const;

type RecordShape = Prisma.MqttStreamAdapterGetPayload<{ select: typeof SELECTION }>;

@Injectable()
export class PrismaMqttStreamAdapterRepository implements IMqttStreamAdapterRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async list(tenantStorageKey?: string): Promise<readonly MqttStreamAdapter[]> {
    const records = await this.prisma.client.mqttStreamAdapter.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        ...(tenantStorageKey === undefined ? {} : { tenant: { storageKey: tenantStorageKey } }),
      },
      select: SELECTION,
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => withoutCredentials(toRecord(record)));
  }

  public async findById(id: string): Promise<MqttStreamAdapterRecord | undefined> {
    const record = await this.prisma.client.mqttStreamAdapter.findUnique({
      where: { id },
      select: SELECTION,
    });
    return record === null ? undefined : toRecord(record);
  }

  public async create(input: SaveAdapterInput): Promise<MqttStreamAdapterRecord | 'NAME_CONFLICT'> {
    const { adapter } = input;
    try {
      const tenant = await this.prisma.client.tenant.upsert({
        where: { storageKey: adapter.tenantStorageKey },
        create: {
          id: adapter.tenantId,
          storageKey: adapter.tenantStorageKey,
          displayName: adapter.tenantDisplayName,
          createdAt: new Date(adapter.createdAt),
          updatedAt: new Date(adapter.updatedAt),
        },
        update: { displayName: adapter.tenantDisplayName },
      });
      const created = await this.prisma.client.mqttStreamAdapter.create({
        data: {
          id: adapter.id,
          publicKey: adapter.publicKey,
          tenantId: tenant.id,
          name: adapter.name,
          brokerUrl: adapter.brokerUrl,
          topicFilter: adapter.topicFilter,
          qos: adapter.qos,
          encryptedCredentialPayload: adapter.credentials.ciphertext,
          encryptionIv: adapter.credentials.initializationVector,
          encryptionAuthTag: adapter.credentials.authenticationTag,
          encryptionKeyVersion: adapter.credentials.keyVersion,
          desiredState: adapter.desiredState,
          status: adapter.status,
          placementKind: adapter.placementKind,
          deploymentId: adapter.deploymentId,
          generation: adapter.generation,
          observedGeneration: adapter.observedGeneration,
          createdAt: new Date(adapter.createdAt),
          updatedAt: new Date(adapter.updatedAt),
        },
        select: SELECTION,
      });
      return toRecord(created);
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) return 'NAME_CONFLICT';
      throw error;
    }
  }

  public async setDesiredState(
    id: string,
    desiredState: StreamAdapterDesiredState,
    updatedAt: string,
  ): Promise<MqttStreamAdapterRecord | undefined> {
    const result = await this.prisma.client.mqttStreamAdapter.updateMany({
      where: { id, status: { not: 'ARCHIVED' } },
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
    credentials: MqttStreamAdapterRecord['credentials'],
    updatedAt: string,
  ): Promise<MqttStreamAdapterRecord | undefined> {
    const result = await this.prisma.client.mqttStreamAdapter.updateMany({
      where: { id, status: { not: 'ARCHIVED' } },
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

  public async claimReconciliation(limit: number, now: string): Promise<ReconcileCandidate[]> {
    const records = await this.prisma.client.mqttStreamAdapter.findMany({
      where: {
        status: { in: ['PROVISIONING', 'DEGRADED', 'FAILED'] },
        reconcileAfter: { lte: new Date(now) },
      },
      select: SELECTION,
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    const candidates: ReconcileCandidate[] = [];
    for (const record of records) {
      const attemptId = randomUUID();
      await this.prisma.client.streamingProvisioningAttempt.create({
        data: {
          id: attemptId,
          adapterId: record.id,
          generation: record.generation,
          status: 'RUNNING',
          startedAt: new Date(now),
        },
      });
      candidates.push({ ...toRecord(record), attemptId });
    }
    return candidates;
  }

  public async completeReconciliation(
    adapterId: string,
    generation: number,
    attemptId: string,
    now: string,
  ): Promise<void> {
    const adapter = await this.prisma.client.mqttStreamAdapter.findUnique({
      where: { id: adapterId },
    });
    if (adapter !== null && adapter.generation === generation) {
      await this.prisma.client.mqttStreamAdapter.update({
        where: { id: adapterId },
        data: {
          observedGeneration: generation,
          status: statusFor(adapter.desiredState),
          lastError: null,
          lastReconciledAt: new Date(now),
          reconcileAfter: new Date(now),
          reconciliationFailures: 0,
        },
      });
    }
    await this.prisma.client.streamingProvisioningAttempt.update({
      where: { id: attemptId },
      data: { status: 'SUCCEEDED', finishedAt: new Date(now) },
    });
  }

  public async failReconciliation(
    adapterId: string,
    generation: number,
    attemptId: string,
    error: string,
    now: string,
  ): Promise<void> {
    const current = await this.prisma.client.mqttStreamAdapter.findUnique({
      where: { id: adapterId },
      select: { reconciliationFailures: true },
    });
    const failures = (current?.reconciliationFailures ?? 0) + 1;
    const retryDelayMilliseconds = Math.min(300_000, 1_000 * 2 ** Math.min(failures, 8));
    const retryAt = new Date(new Date(now).getTime() + retryDelayMilliseconds);
    await this.prisma.client.mqttStreamAdapter.updateMany({
      where: { id: adapterId, generation },
      data: {
        status: failures >= 10 ? 'FAILED' : 'DEGRADED',
        lastError: error,
        lastReconciledAt: new Date(now),
        reconcileAfter: retryAt,
        reconciliationFailures: failures,
      },
    });
    await this.prisma.client.streamingProvisioningAttempt.update({
      where: { id: attemptId },
      data: { status: 'FAILED', error, finishedAt: new Date(now) },
    });
  }
}

function toRecord(record: RecordShape): MqttStreamAdapterRecord {
  return {
    id: record.id,
    publicKey: record.publicKey,
    tenantId: record.tenantId,
    tenantStorageKey: record.tenant.storageKey,
    tenantDisplayName: record.tenant.displayName,
    name: record.name,
    brokerUrl: record.brokerUrl,
    topicFilter: record.topicFilter,
    qos: record.qos as 0 | 1 | 2,
    credentials: {
      ciphertext: record.encryptedCredentialPayload,
      initializationVector: record.encryptionIv,
      authenticationTag: record.encryptionAuthTag,
      keyVersion: record.encryptionKeyVersion,
    },
    desiredState: record.desiredState,
    status: record.status,
    placementKind: record.placementKind,
    deploymentId: record.deploymentId,
    generation: record.generation,
    observedGeneration: record.observedGeneration,
    ...(record.lastError === null ? {} : { lastError: record.lastError }),
    ...(record.lastReconciledAt === null
      ? {}
      : { lastReconciledAt: record.lastReconciledAt.toISOString() }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function withoutCredentials(record: MqttStreamAdapterRecord): MqttStreamAdapter {
  const { credentials, ...adapter } = record;
  void credentials;
  return adapter;
}

function statusFor(desired: StreamAdapterDesiredState): 'ACTIVE' | 'PAUSED' | 'ARCHIVED' {
  if (desired === 'ACTIVE') return 'ACTIVE';
  if (desired === 'PAUSED') return 'PAUSED';
  return 'ARCHIVED';
}
