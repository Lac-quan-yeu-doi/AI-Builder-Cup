import { Injectable } from '@nestjs/common';

import type {
  ChartWithRevision,
  CreateCanonicalChartRecord,
  ICanonicalChartRepository,
  IChartRepository,
  ListChartsRecord,
  RestoreChartRevisionRecord,
  UpdateCanonicalChartRecord,
} from '@application/chart/interfaces/i-chart.repository';
import { ChartError } from '@domain/chart/errors/chart.errors';
import type { Chart, ChartRevision } from '@domain/chart/models/chart';
import type { Prisma } from '@generated/prisma/client';
import {
  decodeQueryDefinition,
  decodeVisualizationDefinition,
  encodeQueryDefinition,
  encodeVisualizationDefinition,
} from '@infrastructure/prisma/chart/chart-json.mapper';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaChartRepository implements IChartRepository, ICanonicalChartRepository {
  public constructor(private readonly prisma: PrismaService) {}

  /** Legacy adapter retained for old Chat-to-Chart routes during migration. */
  public async create(chart: Chart): Promise<Chart> {
    const row = await this.prisma.client.chart.create({
      data: {
        id: chart.id,
        runId: chart.runId,
        title: chart.title,
        chartType: chart.chartType,
        encodings: chart.encodings as Prisma.InputJsonValue,
        data: chart.data as unknown as Prisma.InputJsonValue,
        config: chart.config as Prisma.InputJsonValue,
        vlSpec: chart.vlSpec as unknown as Prisma.InputJsonValue,
        sql: chart.sql,
        status: chart.status,
        errorMessage: chart.errorMessage,
        version: chart.version,
        createdAt: new Date(chart.createdAt),
        updatedAt: new Date(chart.updatedAt),
      },
    });
    return toLegacyChart(row);
  }

  public async findById(id: string): Promise<Chart | null> {
    const row = await this.prisma.client.chart.findUnique({ where: { id } });
    return row ? toLegacyChart(row) : null;
  }

  public async update(chart: Chart, expectedVersion?: number): Promise<Chart | null> {
    const data = {
      title: chart.title,
      chartType: chart.chartType,
      encodings: chart.encodings as unknown as Prisma.InputJsonValue,
      data: chart.data as unknown as Prisma.InputJsonValue,
      config: chart.config as Prisma.InputJsonValue,
      vlSpec: chart.vlSpec as unknown as Prisma.InputJsonValue,
      sql: chart.sql,
      status: chart.status,
      errorMessage: chart.errorMessage,
      version: chart.version,
      updatedAt: new Date(chart.updatedAt),
    };
    if (expectedVersion === undefined) {
      const row = await this.prisma.client.chart.update({ where: { id: chart.id }, data });
      return toLegacyChart(row);
    }
    const result = await this.prisma.client.chart.updateMany({
      where: { id: chart.id, version: expectedVersion },
      data,
    });
    if (result.count !== 1) return null;
    const row = await this.prisma.client.chart.findUnique({ where: { id: chart.id } });
    return row ? toLegacyChart(row) : null;
  }

  public async delete(id: string, expectedVersion?: number): Promise<boolean> {
    if (expectedVersion === undefined) {
      await this.prisma.client.chart.delete({ where: { id } });
      return true;
    }
    const result = await this.prisma.client.chart.deleteMany({
      where: { id, version: expectedVersion },
    });
    return result.count === 1;
  }

  public async list(cursor: string | undefined, limit: number): Promise<readonly Chart[]> {
    const rows = await this.prisma.client.chart.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return rows.map(toLegacyChart);
  }

  public async createCanonical(input: CreateCanonicalChartRecord): Promise<ChartWithRevision> {
    return this.prisma.client.$transaction(async (transaction) => {
      await transaction.chart.create({ data: toChartCreateData(input.chart) });
      const revision = await transaction.chartRevision.create({
        data: toRevisionCreateData(input.revision),
      });
      const chart = await transaction.chart.update({
        where: { id: input.chart.id },
        data: { currentRevisionNumber: input.revision.revisionNumber },
      });
      return { chart: toChart(chart), revision: toRevision(revision) };
    });
  }

  public async updateCanonical(
    input: UpdateCanonicalChartRecord,
  ): Promise<ChartWithRevision | null> {
    return this.writeNextRevision(input);
  }

  public async restoreRevision(
    input: RestoreChartRevisionRecord,
  ): Promise<ChartWithRevision | null> {
    return this.writeNextRevision(input);
  }

  public async findCanonicalById(
    organizationId: string,
    chartId: string,
  ): Promise<ChartWithRevision | null> {
    const chart = await this.prisma.client.chart.findFirst({
      where: {
        id: chartId,
        organizationId,
        legacyState: 'NONE',
        archivedAt: null,
        currentRevisionNumber: { not: null },
      },
      include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
    });
    const revision = chart?.revisions[0];
    if (!chart || !revision) return null;
    return { chart: toChart(chart), revision: toRevision(revision) };
  }

  public async listCanonical(input: ListChartsRecord): Promise<readonly Chart[]> {
    const charts = await this.prisma.client.chart.findMany({
      where: {
        organizationId: input.organizationId,
        legacyState: 'NONE',
        archivedAt: null,
        ...(input.collectionId ? { collectionId: input.collectionId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: input.limit,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    return charts.map(toChart);
  }

  public async listRevisions(
    organizationId: string,
    chartId: string,
  ): Promise<readonly ChartRevision[]> {
    const chart = await this.prisma.client.chart.findFirst({
      where: { id: chartId, organizationId, legacyState: 'NONE' },
      select: { id: true },
    });
    if (!chart) return [];
    const revisions = await this.prisma.client.chartRevision.findMany({
      where: { chartId },
      orderBy: { revisionNumber: 'desc' },
    });
    return revisions.map(toRevision);
  }

  public async moveCanonical(
    organizationId: string,
    chartId: string,
    collectionId: string,
    updatedAt: string,
  ): Promise<Chart | null> {
    const result = await this.prisma.client.chart.updateMany({
      where: { id: chartId, organizationId, legacyState: 'NONE' },
      data: { collectionId, updatedAt: new Date(updatedAt) },
    });
    if (result.count !== 1) return null;
    const row = await this.prisma.client.chart.findUnique({ where: { id: chartId } });
    return row ? toChart(row) : null;
  }

  public async archiveCanonical(
    organizationId: string,
    chartId: string,
    archivedAt: string,
  ): Promise<Chart | null> {
    const result = await this.prisma.client.chart.updateMany({
      where: { id: chartId, organizationId, legacyState: 'NONE' },
      data: { archivedAt: new Date(archivedAt), updatedAt: new Date(archivedAt) },
    });
    if (result.count !== 1) return null;
    const row = await this.prisma.client.chart.findUnique({ where: { id: chartId } });
    return row ? toChart(row) : null;
  }

  private async writeNextRevision(
    input: UpdateCanonicalChartRecord | RestoreChartRevisionRecord,
  ): Promise<ChartWithRevision | null> {
    return this.prisma.client.$transaction(async (transaction) => {
      const update = await transaction.chart.updateMany({
        where: {
          id: input.chart.id,
          organizationId: input.chart.organizationId,
          legacyState: 'NONE',
          currentRevisionNumber: input.expectedRevisionNumber,
        },
        data: {
          collectionId: input.chart.collectionId,
          title: input.chart.title,
          description: input.chart.description,
          archivedAt: input.chart.archivedAt ? new Date(input.chart.archivedAt) : null,
          currentRevisionNumber: input.revision.revisionNumber,
          updatedAt: new Date(input.chart.updatedAt),
        },
      });
      if (update.count !== 1) return null;
      const revision = await transaction.chartRevision.create({
        data: toRevisionCreateData(input.revision),
      });
      await transaction.chartRevision.deleteMany({
        where: {
          chartId: input.chart.id,
          revisionNumber: { lt: Math.max(1, input.revision.revisionNumber - 14) },
        },
      });
      const chart = await transaction.chart.findUniqueOrThrow({ where: { id: input.chart.id } });
      return { chart: toChart(chart), revision: toRevision(revision) };
    });
  }
}

function toChartCreateData(chart: Chart): Prisma.ChartCreateInput {
  return {
    id: chart.id,
    runId: null,
    title: chart.title,
    chartType: 'canonical',
    encodings: {},
    data: [],
    config: {},
    sql: null,
    status: 'ready',
    errorMessage: null,
    version: 1,
    organization: chart.organizationId ? { connect: { id: chart.organizationId } } : undefined,
    collection: chart.collectionId ? { connect: { id: chart.collectionId } } : undefined,
    ownerIdentityId: chart.ownerIdentityId,
    description: chart.description,
    provenance: chart.provenance,
    currentRevisionNumber: null,
    legacyState: chart.legacyState,
    archivedAt: chart.archivedAt ? new Date(chart.archivedAt) : null,
    createdAt: new Date(chart.createdAt),
    updatedAt: new Date(chart.updatedAt),
  };
}

function toRevisionCreateData(revision: ChartRevision): Prisma.ChartRevisionCreateInput {
  return {
    id: revision.id,
    chart: { connect: { id: revision.chartId } },
    revisionNumber: revision.revisionNumber,
    queryDefinition: encodeQueryDefinition(revision.queryDefinition) as Prisma.InputJsonValue,
    visualizationDefinition: encodeVisualizationDefinition(
      revision.visualizationDefinition,
    ) as Prisma.InputJsonValue,
    outputSchema: revision.outputSchema as unknown as Prisma.InputJsonValue,
    queryHash: revision.queryHash,
    createdByIdentityId: revision.createdByIdentityId,
    restoredFromRevision: revision.restoredFromRevisionNumber,
    createdAt: new Date(revision.createdAt),
  };
}

function toChart(row: {
  id: string;
  organizationId: string | null;
  collectionId: string | null;
  ownerIdentityId: string | null;
  title: string;
  description: string | null;
  provenance: string;
  currentRevisionNumber: number | null;
  legacyState: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Chart {
  return {
    id: row.id,
    runId: null,
    chartType: 'canonical',
    encodings: {},
    data: [],
    config: {},
    vlSpec: null,
    sql: null,
    status: 'ready',
    errorMessage: null,
    version: 1,
    organizationId: row.organizationId,
    collectionId: row.collectionId,
    ownerIdentityId: row.ownerIdentityId,
    title: row.title,
    description: row.description,
    provenance: row.provenance as Chart['provenance'],
    currentRevisionNumber: row.currentRevisionNumber,
    legacyState: row.legacyState as Chart['legacyState'],
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toLegacyChart(row: {
  id: string;
  runId: string | null;
  title: string;
  chartType: string;
  encodings: unknown;
  data: unknown;
  config: unknown;
  vlSpec: unknown;
  sql: string | null;
  status: string;
  errorMessage: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): Chart {
  if (!['bar', 'line', 'area', 'point', 'pie', 'arc', 'scatter'].includes(row.chartType)) {
    throw ChartError.invalidChartType(row.chartType);
  }
  return {
    id: row.id,
    runId: row.runId,
    title: row.title,
    chartType: row.chartType,
    encodings: isRecord(row.encodings) ? row.encodings : {},
    data: Array.isArray(row.data) ? (row.data as readonly Record<string, unknown>[]) : [],
    config: isRecord(row.config) ? row.config : {},
    vlSpec: isRecord(row.vlSpec) ? row.vlSpec : null,
    sql: row.sql,
    status: ['draft', 'ready', 'error'].includes(row.status)
      ? (row.status as Chart['status'])
      : 'error',
    errorMessage: row.errorMessage,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRevision(row: {
  id: string;
  chartId: string;
  revisionNumber: number;
  queryDefinition: unknown;
  visualizationDefinition: unknown;
  outputSchema: unknown;
  queryHash: string;
  createdByIdentityId: string;
  restoredFromRevision: number | null;
  createdAt: Date;
}): ChartRevision {
  return {
    id: row.id,
    chartId: row.chartId,
    revisionNumber: row.revisionNumber,
    queryDefinition: decodeQueryDefinition(row.queryDefinition),
    visualizationDefinition: decodeVisualizationDefinition(row.visualizationDefinition),
    outputSchema: Array.isArray(row.outputSchema)
      ? (row.outputSchema as ChartRevision['outputSchema'])
      : [],
    queryHash: row.queryHash,
    createdByIdentityId: row.createdByIdentityId,
    restoredFromRevisionNumber: row.restoredFromRevision,
    createdAt: row.createdAt.toISOString(),
  };
}
