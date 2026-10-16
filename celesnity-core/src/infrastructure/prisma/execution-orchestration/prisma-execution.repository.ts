import { Injectable } from '@nestjs/common';

import { toPrismaExecutionStatus } from '@infrastructure/prisma/execution-orchestration/execution-status.boundary';
import {
  EXECUTION_SELECTION,
  ExecutionMapper,
} from '@infrastructure/prisma/execution-orchestration/execution.mapper';
import { guardHeld } from '@infrastructure/prisma/optimistic-concurrency';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { IExecutionRepository } from '@application/execution-orchestration/interfaces/i-execution-repository';
import { Execution } from '@domain/execution-orchestration/aggregates/execution';
import type {
  ExecutionStatusValue,
  ExecutionId,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';

@Injectable()
export class PrismaExecutionRepository implements IExecutionRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: ExecutionMapper,
  ) {}

  public async create(execution: Execution): Promise<void> {
    await this.prisma.client.execution.create({
      data: {
        id: execution.id.value,
        workloadKind: execution.workload.kind,
        workloadVersionNumber: execution.workload.versionNumber,
        scriptId: execution.scriptId ?? null,
        scriptVersionId: execution.scriptVersionId ?? null,
        pipelineId: execution.pipelineId ?? null,
        pipelineVersionId: execution.pipelineVersionId ?? null,
        databaseServiceId: execution.connectionId ?? null,
        authorizationIdentityId: execution.authorizationIdentityId ?? null,
        queuedAt: execution.queuedAt,
        ...this.mapper.toPersistence(execution),
      },
    });
  }

  public async update(
    execution: Execution,
    expectedStatus: ExecutionStatusValue,
  ): Promise<boolean> {
    const result = await this.prisma.client.execution.updateMany({
      where: { id: execution.id.value, status: toPrismaExecutionStatus(expectedStatus) },
      data: this.mapper.toPersistence(execution),
    });
    return guardHeld(result);
  }

  public async findById(id: ExecutionId): Promise<Execution | undefined> {
    const record = await this.prisma.client.execution.findUnique({
      where: { id: id.value },
      select: EXECUTION_SELECTION,
    });
    return record === null ? undefined : this.mapper.toDomain(record);
  }
}
