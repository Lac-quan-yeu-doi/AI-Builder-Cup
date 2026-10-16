import { Injectable } from '@nestjs/common';

import {
  EXECUTION_SELECTION,
  ExecutionMapper,
} from '@infrastructure/prisma/execution-orchestration/execution.mapper';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { IExecutionReader } from '@application/execution-orchestration/interfaces/i-execution-reader';
import type { ExecutionView } from '@application/execution-orchestration/read-models/execution.view';

/** Bounds an unbounded listing request, so a caller cannot ask for the whole table. */
const MAX_LISTED = 500;

@Injectable()
export class PrismaExecutionReader implements IExecutionReader {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: ExecutionMapper,
  ) {}

  public async listRecent(limit: number): Promise<readonly ExecutionView[]> {
    const records = await this.prisma.client.execution.findMany({
      orderBy: { queuedAt: 'desc' },
      take: Math.max(1, Math.min(limit, MAX_LISTED)),
      select: EXECUTION_SELECTION,
    });
    return records.map((record) => this.mapper.toView(record));
  }

  public async findById(id: string): Promise<ExecutionView | undefined> {
    const record = await this.prisma.client.execution.findUnique({
      where: { id },
      select: EXECUTION_SELECTION,
    });
    return record === null ? undefined : this.mapper.toView(record);
  }
}
