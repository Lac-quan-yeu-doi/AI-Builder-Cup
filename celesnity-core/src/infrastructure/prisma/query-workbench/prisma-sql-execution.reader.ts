import { Injectable } from '@nestjs/common';

import { PrismaService } from '@infrastructure/prisma/prisma.service';
import {
  DETAIL_SELECTION,
  SUMMARY_SELECTION,
  SqlExecutionViewMapper,
} from '@infrastructure/prisma/query-workbench/sql-execution-view.mapper';
import type { ISqlExecutionReader } from '@application/query-workbench/interfaces/i-sql-execution-reader';
import type {
  SqlExecutionDetailView,
  SqlExecutionSummaryView,
} from '@application/query-workbench/read-models/sql-execution.view';

const HISTORY_LIMIT = 200;

/**
 * Prisma-backed read projection for SQL execution history. Projects durable
 * metadata only; the capped row payload is composed in the use case from the
 * in-process result store (Requirement 5.7).
 */
@Injectable()
export class PrismaSqlExecutionReader implements ISqlExecutionReader {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: SqlExecutionViewMapper,
  ) {}

  public async listHistory(): Promise<readonly SqlExecutionSummaryView[]> {
    const records = await this.prisma.client.sqlExecution.findMany({
      orderBy: { queuedAt: 'desc' },
      take: HISTORY_LIMIT,
      select: SUMMARY_SELECTION,
    });
    return records.map((record) => this.mapper.toSummaryView(record));
  }

  public async findById(id: string): Promise<SqlExecutionDetailView | undefined> {
    const record = await this.prisma.client.sqlExecution.findUnique({
      where: { id },
      select: DETAIL_SELECTION,
    });
    return record === null ? undefined : this.mapper.toDetailView(record);
  }
}
