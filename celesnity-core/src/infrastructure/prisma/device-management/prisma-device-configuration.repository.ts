import { Injectable } from '@nestjs/common';
import type { Prisma } from '@generated/prisma/client';

import type { IDeviceConfigurationRepository } from '@application/device-management/interfaces/i-device-configuration.repository';
import type {
  DeviceConfiguration,
  DeviceConfigurationParameters,
  DeviceConfigurationRecord,
  DeviceConfigurationStatus,
  DeviceConfigurationTemplate,
} from '@domain/device-management/models/device-configuration';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const SELECTION = {
  id: true,
  organizationId: true,
  deviceId: true,
  version: true,
  status: true,
  parameters: true,
  restoreFactoryDefaults: true,
  previousAppliedVersion: true,
  eventTokenHash: true,
  requestedBy: true,
  requestedAt: true,
  dispatchedAt: true,
  appliedAt: true,
  confirmedAt: true,
  finishedAt: true,
  error: true,
  updatedAt: true,
} as const;

type Row = Prisma.DeviceConfigurationGetPayload<{ select: typeof SELECTION }>;

const TEMPLATE_SELECTION = {
  id: true,
  organizationId: true,
  name: true,
  version: true,
  parameters: true,
  createdBy: true,
  createdAt: true,
} as const;

type TemplateRow = Prisma.DeviceConfigurationTemplateGetPayload<{
  select: typeof TEMPLATE_SELECTION;
}>;

@Injectable()
export class PrismaDeviceConfigurationRepository implements IDeviceConfigurationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async nextVersion(deviceId: string): Promise<number> {
    const aggregate = await this.prisma.client.deviceConfiguration.aggregate({
      where: { deviceId },
      _max: { version: true },
    });
    return (aggregate._max.version ?? 0) + 1;
  }

  public async create(
    configuration: DeviceConfigurationRecord,
  ): Promise<DeviceConfiguration | 'VERSION_CONFLICT'> {
    try {
      const row = await this.prisma.client.deviceConfiguration.create({
        data: {
          id: configuration.id,
          organizationId: configuration.organizationId,
          deviceId: configuration.deviceId,
          version: configuration.version,
          status: configuration.status,
          parameters: configuration.parameters as Prisma.InputJsonObject,
          restoreFactoryDefaults: configuration.restoreFactoryDefaults,
          previousAppliedVersion: configuration.previousAppliedVersion,
          eventTokenHash: configuration.eventTokenHash,
          requestedBy: configuration.requestedBy,
          requestedAt: new Date(configuration.requestedAt),
          updatedAt: new Date(configuration.updatedAt),
        },
        select: SELECTION,
      });
      await this.prisma.client.device.update({
        where: { id: configuration.deviceId },
        data: { desiredConfigurationVersion: configuration.version },
      });
      return withoutToken(toRecord(row));
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) return 'VERSION_CONFLICT';
      throw error;
    }
  }

  public async list(deviceId: string): Promise<readonly DeviceConfiguration[]> {
    const rows = await this.prisma.client.deviceConfiguration.findMany({
      where: { deviceId },
      select: SELECTION,
      orderBy: { version: 'desc' },
    });
    return rows.map((row) => withoutToken(toRecord(row)));
  }

  public async findTimedOut(
    limit: number,
    dispatchedBefore: string,
  ): Promise<readonly DeviceConfigurationRecord[]> {
    const rows = await this.prisma.client.deviceConfiguration.findMany({
      where: {
        OR: [
          { status: 'DISPATCHED', dispatchedAt: { lte: new Date(dispatchedBefore) } },
          {
            status: 'APPLIED',
            confirmedAt: null,
            appliedAt: { lte: new Date(dispatchedBefore) },
          },
        ],
      },
      select: SELECTION,
      orderBy: { dispatchedAt: 'asc' },
      take: limit,
    });
    return rows.map(toRecord);
  }

  public async findById(id: string): Promise<DeviceConfigurationRecord | undefined> {
    const row = await this.prisma.client.deviceConfiguration.findUnique({
      where: { id },
      select: SELECTION,
    });
    return row === null ? undefined : toRecord(row);
  }

  public async confirmApplied(
    deviceId: string,
    version: number,
    confirmedAt: string,
  ): Promise<DeviceConfiguration | undefined> {
    const timestamp = new Date(confirmedAt);
    const result = await this.prisma.client.deviceConfiguration.updateMany({
      where: { deviceId, version, status: 'APPLIED', confirmedAt: null },
      data: { confirmedAt: timestamp, updatedAt: timestamp },
    });
    if (result.count === 0) return undefined;
    const row = await this.prisma.client.deviceConfiguration.findUnique({
      where: { deviceId_version: { deviceId, version } },
      select: SELECTION,
    });
    return row === null ? undefined : withoutToken(toRecord(row));
  }

  public async updateStatus(
    id: string,
    expectedStatus: DeviceConfigurationStatus,
    status: DeviceConfigurationStatus,
    now: string,
    error?: string,
  ): Promise<DeviceConfiguration | undefined> {
    const timestamp = new Date(now);
    const result = await this.prisma.client.deviceConfiguration.updateMany({
      where: {
        id,
        status: expectedStatus,
        ...(expectedStatus === 'APPLIED' && status === 'ROLLED_BACK' ? { confirmedAt: null } : {}),
      },
      data: {
        status,
        error: error ?? null,
        updatedAt: timestamp,
        ...(status === 'DISPATCHED' ? { dispatchedAt: timestamp } : {}),
        ...(['APPLIED', 'FAILED', 'ROLLED_BACK'].includes(status) ? { finishedAt: timestamp } : {}),
        ...(status === 'APPLIED' ? { appliedAt: timestamp } : {}),
      },
    });
    if (result.count === 0) return undefined;
    const row = await this.prisma.client.deviceConfiguration.findUnique({
      where: { id },
      select: SELECTION,
    });
    if (row === null) return undefined;
    if (status === 'APPLIED') {
      await this.prisma.client.device.update({
        where: { id: row.deviceId },
        data: {
          appliedConfigurationVersion: row.version,
        },
      });
    } else if (status === 'FAILED' || status === 'ROLLED_BACK') {
      await this.prisma.client.device.update({
        where: { id: row.deviceId },
        data: {
          desiredConfigurationVersion: row.previousAppliedVersion,
          ...(status === 'ROLLED_BACK'
            ? {
                appliedConfigurationVersion: row.previousAppliedVersion,
              }
            : {}),
        },
      });
    }
    return withoutToken(toRecord(row));
  }

  public async nextTemplateVersion(name: string): Promise<number> {
    const aggregate = await this.prisma.client.deviceConfigurationTemplate.aggregate({
      where: { name },
      _max: { version: true },
    });
    return (aggregate._max.version ?? 0) + 1;
  }

  public async createTemplate(
    template: DeviceConfigurationTemplate,
  ): Promise<DeviceConfigurationTemplate | 'VERSION_CONFLICT'> {
    try {
      const row = await this.prisma.client.deviceConfigurationTemplate.create({
        data: {
          id: template.id,
          organizationId: template.organizationId,
          name: template.name,
          version: template.version,
          parameters: template.parameters as Prisma.InputJsonObject,
          createdBy: template.createdBy,
          createdAt: new Date(template.createdAt),
        },
        select: TEMPLATE_SELECTION,
      });
      return toTemplate(row);
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        return 'VERSION_CONFLICT';
      }
      throw error;
    }
  }

  public async listTemplates(): Promise<readonly DeviceConfigurationTemplate[]> {
    const rows = await this.prisma.client.deviceConfigurationTemplate.findMany({
      select: TEMPLATE_SELECTION,
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
    return rows.map(toTemplate);
  }

  public async findTemplateById(id: string): Promise<DeviceConfigurationTemplate | undefined> {
    const row = await this.prisma.client.deviceConfigurationTemplate.findUnique({
      where: { id },
      select: TEMPLATE_SELECTION,
    });
    return row === null ? undefined : toTemplate(row);
  }
}

function toRecord(row: Row): DeviceConfigurationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    deviceId: row.deviceId,
    version: row.version,
    status: row.status,
    parameters: decodeParameters(row.parameters),
    restoreFactoryDefaults: row.restoreFactoryDefaults,
    previousAppliedVersion: row.previousAppliedVersion,
    eventTokenHash: row.eventTokenHash,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt.toISOString(),
    ...(row.dispatchedAt === null ? {} : { dispatchedAt: row.dispatchedAt.toISOString() }),
    ...(row.appliedAt === null ? {} : { appliedAt: row.appliedAt.toISOString() }),
    ...(row.confirmedAt === null ? {} : { confirmedAt: row.confirmedAt.toISOString() }),
    ...(row.finishedAt === null ? {} : { finishedAt: row.finishedAt.toISOString() }),
    ...(row.error === null ? {} : { error: row.error }),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function decodeParameters(value: Prisma.JsonValue): DeviceConfigurationParameters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Device configuration parameters must be a JSON object.');
  }
  return value;
}

function withoutToken(record: DeviceConfigurationRecord): DeviceConfiguration {
  const { eventTokenHash, ...configuration } = record;
  void eventTokenHash;
  return configuration;
}

function toTemplate(row: TemplateRow): DeviceConfigurationTemplate {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    version: row.version,
    parameters: decodeParameters(row.parameters),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
