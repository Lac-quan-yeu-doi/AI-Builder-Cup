import { Injectable } from '@nestjs/common';

import type { IDatabaseSourceUsageReader } from '@application/database-service/interfaces/i-database-source-usage-reader';
import { summarizePipelineGraph } from '@domain/pipeline-authoring/models/pipeline-graph-summary';
import { PipelineMapper } from '@infrastructure/prisma/pipeline-authoring/pipeline.mapper';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const PIPELINE_USAGE_SELECTION = {
  id: true,
  name: true,
  graph: true,
} as const;

/**
 * Reads active pipeline usage without loading pipeline aggregates. Graph
 * traversal is delegated to the shared pipeline summary function so source
 * reference semantics cannot drift between authoring and membership guards.
 */
@Injectable()
export class PrismaDatabaseSourceUsageReader implements IDatabaseSourceUsageReader {
  private readonly mapper = new PipelineMapper();

  public constructor(private readonly prisma: PrismaService) {}

  public async listUsingPipelines(
    databaseName: string,
    databaseServiceId: string,
  ): Promise<readonly { readonly id: string; readonly name: string }[]> {
    const records = await this.prisma.client.pipeline.findMany({
      where: { databaseName, archivedAt: null },
      select: PIPELINE_USAGE_SELECTION,
    });

    return records
      .filter((record) => {
        const summary = summarizePipelineGraph(this.mapper.graph(record.graph));
        return summary.sourceConnectionIds.includes(databaseServiceId);
      })
      .map((record) => ({ id: record.id, name: record.name }));
  }
}
