import { Injectable } from '@nestjs/common';

import { guardHeld } from '@infrastructure/prisma/optimistic-concurrency';
import { toPrismaQueryStatus } from '@infrastructure/prisma/query-workbench/query-status.boundary';
import {
  SQL_EXECUTION_SELECTION,
  SqlExecutionMapper,
} from '@infrastructure/prisma/query-workbench/sql-execution.mapper';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { ISqlExecutionRepository } from '@application/query-workbench/interfaces/i-sql-execution-repository';
import { SqlExecution } from '@domain/query-workbench/aggregates/sql-execution';
import type {
  SqlExecutionId,
  QueryStatusValue,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';

/**
 * Prisma-backed implementation of {@link ISqlExecutionRepository}.
 *
 * The insert runs inside the submit unit of work, alongside the outbox message.
 * Every subsequent transition is a status-guarded `updateMany`, which gives
 * optimistic concurrency without row locks: a transition only lands when the
 * stored status still matches the expected prior status.
 */
@Injectable()
export class PrismaSqlExecutionRepository implements ISqlExecutionRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: SqlExecutionMapper,
  ) {}

  public async create(execution: SqlExecution): Promise<void> {
    await this.prisma.client.sqlExecution.create({
      data: this.mapper.toInsertPersistence(execution),
    });
  }

  public async findById(id: SqlExecutionId): Promise<SqlExecution | undefined> {
    const record = await this.prisma.client.sqlExecution.findUnique({
      where: { id: id.value },
      select: SQL_EXECUTION_SELECTION,
    });
    return record === null ? undefined : this.mapper.toDomain(record);
  }

  public async updateStatus(
    execution: SqlExecution,
    expectedStatus: QueryStatusValue,
  ): Promise<boolean> {
    const result = await this.prisma.client.sqlExecution.updateMany({
      where: {
        id: execution.id.value,
        status: toPrismaQueryStatus(expectedStatus),
      },
      data: this.mapper.toPersistence(execution),
    });
    return guardHeld(result);
  }
}
