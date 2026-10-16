import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  ICatalogReader,
  CatalogValueLookup,
  CatalogValueLookupResult,
  PreviewColumn,
  TablePreview,
  TablePreviewOptions,
} from '@application/catalog-exploration/interfaces/i-catalog-reader';
import {
  ColumnMetadata,
  ColumnProfile,
  type ColumnProfileKind,
  Namespace,
  TableMetadata,
  TableSnapshot,
  TableSummary,
} from '@domain/catalog-exploration/models/catalog-models';
import {
  ColumnType,
  type CatalogName,
  type NamespaceName,
  type TablePath,
} from '@domain/catalog-exploration/value-objects/catalog-value-objects';
import {
  TrinoCatalogStatementClient,
  type TrinoResult,
} from '@infrastructure/trino/catalog-exploration/trino-catalog-statement.client';

/**
 * Trino-backed implementation of the {@link ICatalogReader} port.
 *
 * This adapter is the only place catalog SQL is composed. It receives validated
 * value objects, double-quotes every identifier, and prefers `SHOW`,
 * `information_schema`, and Iceberg system tables for metadata. It never mutates
 * catalog state (Requirement 4.6) and never exposes Trino internals: the
 * statement client already maps failures to categorized domain errors.
 */
@Injectable()
export class TrinoCatalogReader implements ICatalogReader {
  private readonly client: TrinoCatalogStatementClient;

  public constructor(config: ConfigService) {
    this.client = new TrinoCatalogStatementClient(
      config.getOrThrow<string>('TRINO_URL'),
      config.getOrThrow<string>('TRINO_USER'),
      // getOrThrow, not get: the environment schema always supplies this key, with
      // an empty string when Trino needs no password. A missing key means the schema
      // and this adapter have drifted, which is worth failing on.
      config.getOrThrow<string>('TRINO_PASSWORD'),
    );
  }

  public async listSchemas(catalog: CatalogName): Promise<readonly Namespace[]> {
    const sql = `SHOW SCHEMAS FROM ${catalog.quoted}`;
    const result = await this.client.execute(sql, { catalog: catalog.value });
    const namespaceColumn = columnIndex(result, 'schema') ?? 0;
    return (
      result.rows
        .map((row) => asString(row[namespaceColumn]))
        .filter((name): name is string => name !== undefined)
        // information_schema is a Trino built-in, not a browsable Iceberg namespace.
        .filter((name) => name !== 'information_schema')
        .map((name) => Namespace.create(catalog.value, name))
    );
  }

  public async listTables(
    catalog: CatalogName,
    schema: NamespaceName,
  ): Promise<readonly TableSummary[]> {
    const sql =
      `SELECT table_name, table_type ` +
      `FROM ${catalog.quoted}.information_schema.tables ` +
      `WHERE table_schema = ${stringLiteral(schema.value)} ` +
      `ORDER BY table_name`;
    const result = await this.client.execute(sql, { catalog: catalog.value });
    const nameIndex = columnIndex(result, 'table_name') ?? 0;
    const typeIndex = columnIndex(result, 'table_type') ?? 1;
    return result.rows
      .map((row) => ({
        name: asString(row[nameIndex]),
        type: asString(row[typeIndex]) ?? 'BASE TABLE',
      }))
      .filter((entry): entry is { name: string; type: string } => entry.name !== undefined)
      .map((entry) => TableSummary.create(catalog.value, schema.value, entry.name, entry.type));
  }

  public async listColumns(path: TablePath): Promise<TableMetadata> {
    const sql =
      `SELECT column_name, data_type, is_nullable, ordinal_position, comment ` +
      `FROM ${path.catalog.quoted}.information_schema.columns ` +
      `WHERE table_schema = ${stringLiteral(path.schema.value)} ` +
      `AND table_name = ${stringLiteral(path.table.value)} ` +
      `ORDER BY ordinal_position`;
    const result = await this.client.execute(sql, { catalog: path.catalog.value });
    const nameIndex = columnIndex(result, 'column_name') ?? 0;
    const typeIndex = columnIndex(result, 'data_type') ?? 1;
    const nullableIndex = columnIndex(result, 'is_nullable') ?? 2;
    const ordinalIndex = columnIndex(result, 'ordinal_position') ?? 3;
    const commentIndex = columnIndex(result, 'comment') ?? 4;

    const columns = result.rows
      .map((row, position) => {
        const name = asString(row[nameIndex]);
        if (name === undefined) {
          return undefined;
        }
        const dataType = ColumnType.create(asString(row[typeIndex]) ?? 'unknown').value;
        return ColumnMetadata.create({
          name,
          dataType,
          nullable: asString(row[nullableIndex])?.toUpperCase() !== 'NO',
          ordinalPosition: asNumber(row[ordinalIndex]) ?? position + 1,
          comment: asString(row[commentIndex]),
        });
      })
      .filter((column): column is ColumnMetadata => column !== undefined);

    return TableMetadata.create(path.catalog.value, path.schema.value, path.table.value, columns);
  }

  public async listSnapshots(path: TablePath): Promise<readonly TableSnapshot[]> {
    // Bigint snapshot identifiers are cast to varchar to avoid JSON precision
    // loss; committed_at is normalized to a string for stable serialization.
    const sql =
      `SELECT CAST(snapshot_id AS varchar) AS snapshot_id, ` +
      `CAST(parent_id AS varchar) AS parent_id, ` +
      `CAST(committed_at AS varchar) AS committed_at, ` +
      `operation, manifest_list, summary ` +
      `FROM ${path.toMetadataTableSql('snapshots')} ` +
      `ORDER BY committed_at`;
    const result = await this.client.execute(sql, { catalog: path.catalog.value });
    const snapshotIndex = columnIndex(result, 'snapshot_id') ?? 0;
    const parentIndex = columnIndex(result, 'parent_id') ?? 1;
    const committedIndex = columnIndex(result, 'committed_at') ?? 2;
    const operationIndex = columnIndex(result, 'operation') ?? 3;
    const manifestIndex = columnIndex(result, 'manifest_list') ?? 4;
    const summaryIndex = columnIndex(result, 'summary') ?? 5;

    return result.rows
      .map((row) => {
        const snapshotId = asString(row[snapshotIndex]);
        if (snapshotId === undefined) {
          return undefined;
        }
        return TableSnapshot.create({
          snapshotId,
          parentId: asString(row[parentIndex]),
          committedAt: asString(row[committedIndex]) ?? '',
          operation: asString(row[operationIndex]),
          manifestList: asString(row[manifestIndex]),
          summary: asStringMap(row[summaryIndex]),
        });
      })
      .filter((snapshot): snapshot is TableSnapshot => snapshot !== undefined);
  }

  public async previewTable(
    path: TablePath,
    maxRows: number,
    options?: TablePreviewOptions,
  ): Promise<TablePreview> {
    // maxRows is a validated integer sourced from configuration, so it is safe
    // to inline as a numeric literal (Requirement 4.4).
    const devicePredicate =
      options?.deviceId === undefined
        ? ''
        : ` WHERE "device_id" = ${stringLiteral(options.deviceId)} ORDER BY "received_at" DESC`;
    const sql = `SELECT * FROM ${path.toQualifiedSql()}${devicePredicate} LIMIT ${String(maxRows)}`;
    const result = await this.client.execute(sql, { catalog: path.catalog.value });
    const columns: PreviewColumn[] = result.columns.map((column) => ({
      name: column.name,
      type: column.type,
    }));
    return { columns, rows: result.rows };
  }

  public async profileTable(path: TablePath): Promise<readonly ColumnProfile[]> {
    const metadata = await this.listColumns(path);
    const computedAt = new Date().toISOString();
    const classified = metadata.columns.map((column) => ({
      column,
      kind: classifyColumnKind(column.dataType),
    }));

    const stringColumns = classified
      .filter((entry) => entry.kind === 'string')
      .map((entry) => entry.column);
    const numericColumns = classified
      .filter((entry) => entry.kind === 'numeric')
      .map((entry) => entry.column);

    const [categoricalNames, numericStats] = await Promise.all([
      this.selectCategoricalColumnNames(path, stringColumns),
      this.selectNumericStats(path, numericColumns),
    ]);
    const topValuesByColumn = await this.selectTopValues(path, categoricalNames);

    return classified.map(({ column, kind }) => {
      if (kind === 'string') {
        return ColumnProfile.create({
          name: column.name,
          dataType: column.dataType,
          kind,
          topValues: topValuesByColumn.get(column.name),
          computedAt,
        });
      }
      if (kind === 'numeric') {
        const stats = numericStats.get(column.name);
        return ColumnProfile.create({
          name: column.name,
          dataType: column.dataType,
          kind,
          min: stats?.min,
          max: stats?.max,
          avg: stats?.avg,
          computedAt,
        });
      }
      return ColumnProfile.create({
        name: column.name,
        dataType: column.dataType,
        kind,
        computedAt,
      });
    });
  }

  public async lookupValues(
    path: TablePath,
    lookup: CatalogValueLookup,
  ): Promise<CatalogValueLookupResult> {
    const value = quoteIdentifier(lookup.valueColumn);
    const label = lookup.labelColumn === undefined ? value : quoteIdentifier(lookup.labelColumn);
    const operators = { eq: '=', ne: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' } as const;
    const where =
      lookup.filters.length === 0
        ? ''
        : ` WHERE ${lookup.filters
            .map((filter) => {
              const column = quoteIdentifier(filter.column);
              if (filter.value === null) {
                return `${column} ${filter.operator === 'ne' ? 'IS NOT NULL' : 'IS NULL'}`;
              }
              return `${column} ${operators[filter.operator]} ${valueLiteral(filter.value)}`;
            })
            .join(' AND ')}`;
    const order =
      lookup.orderBy === undefined
        ? ''
        : ` ORDER BY ${quoteIdentifier(lookup.orderBy.column)} ${lookup.orderBy.direction.toUpperCase()}`;
    const sql =
      `SELECT DISTINCT ${value} AS "value", ${label} AS "label" ` +
      `FROM ${path.toQualifiedSql()}${where}${order} LIMIT ${String(lookup.limit)}`;
    const result = await this.client.execute(sql, { catalog: path.catalog.value });
    return {
      rows: result.rows.map((row) => {
        const labelValue = scalar(row[1] ?? row[0]);
        return { value: scalar(row[0]), label: labelValue === null ? '' : String(labelValue) };
      }),
    };
  }

  /**
   * One batched `approx_distinct` scan across every string column, so a table
   * with many string columns costs one query, not one per column. Columns
   * whose approximate cardinality exceeds the categorical threshold (likely
   * IDs/UUIDs) are excluded from the follow-up top-values pull entirely.
   */
  private async selectCategoricalColumnNames(
    path: TablePath,
    columns: readonly ColumnMetadata[],
  ): Promise<readonly string[]> {
    if (columns.length === 0) return [];
    const selects = columns.map(
      (column, index) => `approx_distinct(${quoteIdentifier(column.name)}) AS "c${String(index)}"`,
    );
    const sql = `SELECT ${selects.join(', ')} FROM ${path.toQualifiedSql()}`;
    const result = await this.client.execute(sql, { catalog: path.catalog.value });
    const row = result.rows[0];
    if (row === undefined) return [];
    return columns
      .filter((_column, index) => {
        const colIndex = columnIndex(result, `c${String(index)}`);
        const count = colIndex === undefined ? undefined : asNumber(row[colIndex]);
        return count !== undefined && count <= PROFILE_CATEGORICAL_CARDINALITY_THRESHOLD;
      })
      .map((column) => column.name);
  }

  /** One `SELECT DISTINCT ... LIMIT` per categorical column — Trino has no way to batch these into one query. */
  private async selectTopValues(
    path: TablePath,
    columnNames: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const entries = await Promise.all(
      columnNames.map(async (name) => {
        const quoted = quoteIdentifier(name);
        const sql =
          `SELECT DISTINCT ${quoted} FROM ${path.toQualifiedSql()} ` +
          `WHERE ${quoted} IS NOT NULL LIMIT ${String(PROFILE_TOP_VALUES_LIMIT)}`;
        const result = await this.client.execute(sql, { catalog: path.catalog.value });
        const values = result.rows
          .map((row) => asString(row[0]))
          .filter((value): value is string => value !== undefined);
        return [name, values] as const;
      }),
    );
    return new Map(entries);
  }

  /** One batched min/max/avg scan across every numeric column, using positional aliases to avoid any column-name collision. */
  private async selectNumericStats(
    path: TablePath,
    columns: readonly ColumnMetadata[],
  ): Promise<
    ReadonlyMap<string, { readonly min: number; readonly max: number; readonly avg: number }>
  > {
    const stats = new Map<string, { min: number; max: number; avg: number }>();
    if (columns.length === 0) return stats;
    const selects = columns.flatMap((column, index) => {
      const quoted = quoteIdentifier(column.name);
      return [
        `min(${quoted}) AS "c${String(index)}_min"`,
        `max(${quoted}) AS "c${String(index)}_max"`,
        `avg(${quoted}) AS "c${String(index)}_avg"`,
      ];
    });
    const sql = `SELECT ${selects.join(', ')} FROM ${path.toQualifiedSql()}`;
    const result = await this.client.execute(sql, { catalog: path.catalog.value });
    const row = result.rows[0];
    if (row === undefined) return stats;
    columns.forEach((column, index) => {
      const minIndex = columnIndex(result, `c${String(index)}_min`);
      const maxIndex = columnIndex(result, `c${String(index)}_max`);
      const avgIndex = columnIndex(result, `c${String(index)}_avg`);
      const min = minIndex === undefined ? undefined : asNumber(row[minIndex]);
      const max = maxIndex === undefined ? undefined : asNumber(row[maxIndex]);
      const avg = avgIndex === undefined ? undefined : asNumber(row[avgIndex]);
      if (min !== undefined && max !== undefined && avg !== undefined) {
        stats.set(column.name, { min, max, avg });
      }
    });
    return stats;
  }
}

// Distinct values beyond this cap are not worth pulling — Foundry's Quiver
// AIP grounding uses the same figure for "up to 100 unique values."
const PROFILE_TOP_VALUES_LIMIT = 100;
// String columns with more distinct values than this look ID-like rather
// than categorical, so pulling their top values wouldn't help an LLM reason
// about "high/low/medium" or correct a misspelling — skip them.
const PROFILE_CATEGORICAL_CARDINALITY_THRESHOLD = 1000;

const STRING_TYPE_PATTERN = /^(var)?char(\(|$)/iu;
const NUMERIC_TYPE_PATTERN =
  /^(tinyint|smallint|integer|int|bigint|double|real|decimal|float)(\(|$)/iu;

/** Pure classification of a Trino type string, exported for unit testing without a Trino connection. */
export function classifyColumnKind(dataType: string): ColumnProfileKind {
  if (STRING_TYPE_PATTERN.test(dataType)) return 'string';
  if (NUMERIC_TYPE_PATTERN.test(dataType)) return 'numeric';
  return 'other';
}

/** Double-quotes an arbitrary column name, escaping embedded quotes, for safe interpolation into generated SQL. */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/gu, '""')}"`;
}

function columnIndex(result: TrinoResult, name: string): number | undefined {
  const target = name.toLowerCase();
  const index = result.columns.findIndex((column) => column.name.toLowerCase() === target);
  return index >= 0 ? index : undefined;
}

function stringLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

function valueLiteral(value: string | number | boolean): string {
  if (typeof value === 'string') return stringLiteral(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function scalar(value: unknown): string | number | boolean | null {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : null;
}

function asString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asStringMap(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const entries: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const normalized = asString(rawValue);
    if (normalized !== undefined) {
      entries[key] = normalized;
    }
  }
  return entries;
}
