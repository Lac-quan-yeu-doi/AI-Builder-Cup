import { Injectable } from '@nestjs/common';

import type {
  IPendingActionRepository,
  PendingActionListFilter,
} from '@application/actions/interfaces/i-pending-action.repository';
import type { PendingAction, PendingActionStatus } from '@application/actions/pending-action.model';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { Prisma } from '@generated/prisma/client';

@Injectable()
export class PrismaPendingActionRepository implements IPendingActionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(pendingAction: PendingAction): Promise<PendingAction> {
    const row = await this.prisma.client.pendingAction.create({
      data: {
        id: pendingAction.id,
        actionName: pendingAction.actionName,
        input: pendingAction.input as object,
        actor: pendingAction.actor as unknown as Prisma.InputJsonValue,
        status: pendingAction.status,
        rationale: pendingAction.rationale,
        result: pendingAction.result as object | undefined,
        errorMessage: pendingAction.errorMessage,
        createdAt: pendingAction.createdAt,
        decidedAt: pendingAction.decidedAt,
        expiresAt: pendingAction.expiresAt,
      },
    });
    return this.toDomain(row);
  }

  public async findById(id: string): Promise<PendingAction | null> {
    const row = await this.prisma.client.pendingAction.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  public async update(pendingAction: PendingAction): Promise<PendingAction> {
    const row = await this.prisma.client.pendingAction.update({
      where: { id: pendingAction.id },
      data: {
        status: pendingAction.status,
        result: pendingAction.result as object | undefined,
        errorMessage: pendingAction.errorMessage,
        decidedAt: pendingAction.decidedAt,
      },
    });
    return this.toDomain(row);
  }

  public async list(filter?: PendingActionListFilter): Promise<readonly PendingAction[]> {
    const where: Prisma.PendingActionWhereInput = {};
    if (filter?.status) {
      where.status = filter.status;
    }
    // A single `actor` filter can only express one JSON path, so
    // actorSource + runId (both matching against the same `actor` JSON
    // column) are combined under AND rather than overwriting each other.
    const actorFilters: Prisma.PendingActionWhereInput[] = [];
    if (filter?.actorSource) {
      actorFilters.push({ actor: { path: ['source'], equals: filter.actorSource } });
    }
    if (filter?.runId) {
      actorFilters.push({ actor: { path: ['runId'], equals: filter.runId } });
    }
    if (filter?.identityId) {
      actorFilters.push({ actor: { path: ['identityId'], equals: filter.identityId } });
    }
    if (actorFilters.length > 0) {
      where.AND = actorFilters;
    }

    const rows = await this.prisma.client.pendingAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: {
    id: string;
    actionName: string;
    input: unknown;
    actor: unknown;
    status: string;
    rationale: string | null;
    result: unknown;
    errorMessage: string | null;
    createdAt: Date;
    decidedAt: Date | null;
    expiresAt: Date;
  }): PendingAction {
    return {
      id: row.id,
      actionName: row.actionName,
      input: row.input,
      actor: row.actor as PendingAction['actor'],
      status: row.status as PendingActionStatus,
      rationale: row.rationale,
      result: row.result ?? null,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}
