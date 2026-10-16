import { Injectable } from '@nestjs/common';

import type {
  AuditLogListFilter,
  IAuditLogRepository,
} from '@application/actions/interfaces/i-audit-log.repository';
import type { AuditLogEntry } from '@application/actions/audit-log-entry.model';
import type { Prisma } from '@generated/prisma/client';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaAuditLogRepository implements IAuditLogRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    const row = await this.prisma.client.auditLogEntry.create({
      data: {
        id: entry.id,
        actionName: entry.actionName,
        actor: entry.actor as unknown as Prisma.InputJsonValue,
        input: entry.input as object,
        createdAt: entry.createdAt,
      },
    });
    return this.toDomain(row);
  }

  public async list(filter?: AuditLogListFilter): Promise<readonly AuditLogEntry[]> {
    const rows = await this.prisma.client.auditLogEntry.findMany({
      where: filter?.actionName ? { actionName: filter.actionName } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter?.limit ?? 50, 200),
      ...(filter?.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: {
    id: string;
    actionName: string;
    actor: unknown;
    input: unknown;
    createdAt: Date;
  }): AuditLogEntry {
    return {
      id: row.id,
      actionName: row.actionName,
      actor: row.actor as AuditLogEntry['actor'],
      input: row.input,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
