import { Injectable } from '@nestjs/common';
import type { Prisma } from '@generated/prisma/client';

import type {
  DeviceLogFilter,
  IDeviceLogRepository,
} from '@application/device-management/interfaces/i-device-log.repository';
import type { DeviceLogEntry } from '@domain/device-management/models/device-log';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const SELECTION = {
  id: true,
  organizationId: true,
  deviceId: true,
  sourceEventId: true,
  level: true,
  kind: true,
  message: true,
  context: true,
  observedAt: true,
  receivedAt: true,
  device: { select: { name: true } },
} as const;

type DeviceLogRow = Prisma.DeviceLogGetPayload<{ select: typeof SELECTION }>;

@Injectable()
export class PrismaDeviceLogRepository implements IDeviceLogRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(entry: DeviceLogEntry): Promise<DeviceLogEntry | 'SOURCE_EVENT_CONFLICT'> {
    try {
      const row = await this.prisma.client.deviceLog.create({
        data: {
          id: entry.id,
          organizationId: entry.organizationId,
          deviceId: entry.deviceId,
          sourceEventId: entry.sourceEventId,
          level: entry.level,
          kind: entry.kind,
          message: entry.message,
          context: entry.context as Prisma.InputJsonObject,
          observedAt: new Date(entry.observedAt),
          receivedAt: new Date(entry.receivedAt),
        },
        select: SELECTION,
      });
      return toDeviceLog(row);
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        return 'SOURCE_EVENT_CONFLICT';
      }
      throw error;
    }
  }

  public async findBySourceEventId(sourceEventId: string): Promise<DeviceLogEntry | undefined> {
    const row = await this.prisma.client.deviceLog.findFirst({
      where: { sourceEventId },
      select: SELECTION,
    });
    return row === null ? undefined : toDeviceLog(row);
  }

  public async list(filter: DeviceLogFilter): Promise<readonly DeviceLogEntry[]> {
    const rows = await this.prisma.client.deviceLog.findMany({
      where: {
        deviceId: filter.deviceId,
        ...(filter.level === undefined ? {} : { level: filter.level }),
        ...(filter.kind === undefined ? {} : { kind: filter.kind }),
      },
      select: SELECTION,
      orderBy: { observedAt: 'desc' },
      take: filter.limit,
    });
    return rows.map(toDeviceLog);
  }
}

function toDeviceLog(row: DeviceLogRow): DeviceLogEntry {
  if (typeof row.context !== 'object' || row.context === null || Array.isArray(row.context)) {
    throw new Error('Device log context must be a JSON object.');
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    deviceId: row.deviceId,
    deviceName: row.device.name,
    sourceEventId: row.sourceEventId,
    level: row.level,
    kind: row.kind,
    message: row.message,
    context: row.context,
    observedAt: row.observedAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
  };
}
