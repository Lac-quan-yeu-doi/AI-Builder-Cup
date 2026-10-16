import { Inject, Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';

import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import type { IConnectionExecutionProfileProvider } from '@application/database-service/interfaces/i-connection-execution-profile-provider';
import { CONNECTION_EXECUTION_PROFILE_PROVIDER } from '@application/database-service/tokens';
import type {
  IPipelineNodePreviewer,
  NodePreviewResult,
} from '@application/pipeline-authoring/interfaces/i-pipeline-node-previewer';
import { PipelineError } from '@domain/pipeline-authoring/errors/pipeline.errors';
import type { Pipeline, PipelineNode } from '@domain/pipeline-authoring/models/pipeline';

interface PreviewDataSet {
  readonly columns: NodePreviewResult['columns'];
  readonly rows: NodePreviewResult['rows'];
  readonly truncated: boolean;
}

@Injectable()
export class PipelineNodePreviewer implements IPipelineNodePreviewer {
  private readonly logger = new Logger(PipelineNodePreviewer.name);

  public constructor(
    @Inject(CONNECTION_EXECUTION_PROFILE_PROVIDER)
    private readonly connections: IConnectionExecutionProfileProvider,
    private readonly catalogs: CatalogExplorationUseCases,
  ) {}

  public async preview(
    pipeline: Pipeline,
    node: PipelineNode,
    limit: number,
  ): Promise<NodePreviewResult> {
    const startedAt = performance.now();
    try {
      const data = await this.previewNode(pipeline, node, limit, new Set());
      return {
        columns: data.columns,
        rows: data.rows,
        returnedRows: data.rows.length,
        truncated: data.truncated,
        executionTimeMs: Math.round((performance.now() - startedAt) * 100) / 100,
      };
    } catch (error: unknown) {
      if (error instanceof PipelineError) {
        throw error;
      }
      this.logger.error('Pipeline node preview failed.', errorStack(error));
      throw PipelineError.previewFailed();
    }
  }

  private async previewNode(
    pipeline: Pipeline,
    node: PipelineNode,
    limit: number,
    visiting: Set<string>,
  ): Promise<PreviewDataSet> {
    if (visiting.has(node.id)) {
      throw PipelineError.previewFailed('Node preview cannot evaluate a cyclic graph.');
    }
    const nextVisiting = new Set(visiting).add(node.id);

    if (node.definitionType === 'POSTGRES_SOURCE') {
      return this.previewPostgresSource(node, limit);
    }

    const upstream = this.upstreamNode(pipeline, node);
    if (node.definitionType === 'SELECT_FIELDS') {
      return this.selectFields(
        await this.previewNode(pipeline, upstream, limit, nextVisiting),
        node,
      );
    }

    if (node.definitionType === 'ICEBERG_TARGET') {
      if (upstream !== node) {
        return this.previewNode(pipeline, upstream, limit, nextVisiting);
      }
      return this.previewIcebergTarget(node, limit);
    }

    throw PipelineError.previewFailed(
      `Preview is not implemented for node type ${node.definitionType}.`,
    );
  }

  private upstreamNode(pipeline: Pipeline, node: PipelineNode): PipelineNode {
    const edge = pipeline.graph.edges.find((candidate) => candidate.targetNodeId === node.id);
    if (edge === undefined) {
      return node;
    }
    const upstream = pipeline.graph.nodes.find((candidate) => candidate.id === edge.sourceNodeId);
    if (upstream === undefined) {
      throw PipelineError.previewFailed('The preview node has a missing upstream node.');
    }
    return upstream;
  }

  private async previewPostgresSource(node: PipelineNode, limit: number): Promise<PreviewDataSet> {
    const connectionId = requiredString(node.config.connectionId);
    const schemaName = requiredString(node.config.schemaName);
    const tableName = requiredString(node.config.tableName);
    const profile = await this.connections.resolveExecutionProfile(connectionId);
    const connectionUrl = new URL(profile.jdbcUrl.replace(/^jdbc:/u, ''));
    connectionUrl.username = requiredString(profile.publicOptions.SOURCE_POSTGRES_USER);
    connectionUrl.password = requiredString(profile.secretOptions.SOURCE_POSTGRES_PASSWORD);
    const client = new Client({
      // pg's connection-string parser replaces separately supplied credentials
      // with empty URL credentials. Embed them in this short-lived URL so the
      // startup packet always includes the saved connection username.
      connectionString: connectionUrl.toString(),
    });
    try {
      await client.connect();
      const result = await client.query<Record<string, unknown>>(
        `SELECT * FROM ${quotedIdentifier(schemaName)}.${quotedIdentifier(tableName)} LIMIT ${String(limit + 1)}`,
      );
      return {
        columns: result.fields.map((field) => ({
          name: field.name,
          dataType: postgresType(field.dataTypeID),
          nullable: true,
        })),
        rows: result.rows.slice(0, limit),
        truncated: result.rows.length > limit,
      };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private selectFields(data: PreviewDataSet, node: PipelineNode): PreviewDataSet {
    const fields = Array.isArray(node.config.fields)
      ? node.config.fields.filter((field): field is string => typeof field === 'string')
      : [];
    if (fields.length === 0) {
      throw PipelineError.previewFailed('SELECT_FIELDS requires at least one selected field.');
    }
    const available = new Set(data.columns.map((column) => column.name));
    if (fields.some((field) => !available.has(field))) {
      throw PipelineError.previewFailed('SELECT_FIELDS references a column that is unavailable.');
    }
    return {
      columns: fields.map((field) => data.columns.find((column) => column.name === field)!),
      rows: data.rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))),
      truncated: data.truncated,
    };
  }

  private async previewIcebergTarget(node: PipelineNode, limit: number): Promise<PreviewDataSet> {
    const resourceId = node.resourceId;
    if (resourceId === undefined || !resourceId.startsWith('iceberg:')) {
      throw PipelineError.previewFailed('The Iceberg target resource is invalid.');
    }
    const [catalog, legacySchema, legacyTable] = resourceId.slice('iceberg:'.length).split('.');
    const schema =
      typeof node.config.databaseName === 'string' ? node.config.databaseName : legacySchema;
    const table =
      node.config.tableMode === 'CREATE_NEW'
        ? typeof node.config.newTableName === 'string'
          ? node.config.newTableName
          : undefined
        : typeof node.config.tableName === 'string'
          ? node.config.tableName
          : legacyTable;
    if (catalog === undefined || schema === undefined || table === undefined) {
      throw PipelineError.previewFailed('The Iceberg target resource is invalid.');
    }
    const [preview, metadata] = await Promise.all([
      this.catalogs.previewTable(catalog, schema, table),
      this.catalogs.listColumns(catalog, schema, table),
    ]);
    const rows = preview.rows
      .slice(0, limit)
      .map((row) =>
        Object.fromEntries(preview.columns.map((column, index) => [column.name, row[index]])),
      );
    return {
      columns: preview.columns.map((column) => ({
        name: column.name,
        dataType: column.type,
        nullable:
          metadata.columns.find((candidate) => candidate.name === column.name)?.nullable ?? true,
      })),
      rows,
      truncated: preview.rows.length > limit,
    };
  }
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw PipelineError.previewFailed('The preview node configuration is incomplete.');
  }
  return value;
}

function quotedIdentifier(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

function postgresType(oid: number): string {
  const names: Readonly<Record<number, string>> = {
    16: 'BOOLEAN',
    20: 'BIGINT',
    21: 'SMALLINT',
    23: 'INTEGER',
    25: 'TEXT',
    114: 'JSON',
    700: 'REAL',
    701: 'DOUBLE PRECISION',
    1043: 'VARCHAR',
    1082: 'DATE',
    1114: 'TIMESTAMP',
    1184: 'TIMESTAMPTZ',
    1700: 'NUMERIC',
    2950: 'UUID',
    3802: 'JSONB',
  };
  return names[oid] ?? `POSTGRES_OID_${String(oid)}`;
}
