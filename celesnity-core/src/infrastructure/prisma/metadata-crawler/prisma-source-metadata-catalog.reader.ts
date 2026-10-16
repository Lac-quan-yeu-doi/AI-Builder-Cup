import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';

import type { ISourceMetadataCatalogReader } from '@application/metadata-crawler/interfaces/i-source-metadata-catalog-reader';
import type {
  SourceColumnSort,
  SourceColumnView,
  SourceConstraintView,
  SourceMetadataPage,
  SourceMetadataPageRequest,
  SourceMetadataSnapshotSummary,
  SourceNamespaceSort,
  SourceNamespaceView,
  SourceRelationSort,
  SourceRelationView,
} from '@application/metadata-crawler/read-models/source-metadata.view';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  CURRENT_METADATA_SNAPSHOT_STATUSES,
  currentMetadataSnapshotRunWhere,
} from '@infrastructure/prisma/metadata-crawler/current-metadata-snapshot';

interface SummaryRow {
  database_service_id: string;
  database_count: bigint | number;
  schema_count: bigint | number;
  relation_count: bigint | number;
  column_count: bigint | number;
  constraint_count: bigint | number;
  last_crawled_at: Date | null;
}

interface NamespaceRow {
  id: string;
  name: string;
  namespace_type: string;
  description: string | null;
  relation_count: bigint | number;
  last_crawled_at: Date | null;
}

interface RelationRow {
  id: string;
  namespace_id: string;
  name: string;
  relation_type: string;
  description: string | null;
  column_count: bigint | number;
  ddl: string | null;
  properties: unknown;
  last_crawled_at: Date | null;
}

@Injectable()
export class PrismaSourceMetadataCatalogReader implements ISourceMetadataCatalogReader {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public async summariesByDatabaseServiceIds(
    databaseServiceIds: readonly string[],
  ): Promise<ReadonlyMap<string, SourceMetadataSnapshotSummary>> {
    if (databaseServiceIds.length === 0) return new Map();
    const organizationId = this.contexts.require().organizationId;
    const requested = [...new Set(databaseServiceIds)];
    const rows = await this.prisma.client.$queryRaw<SummaryRow[]>(Prisma.sql`
      WITH requested(database_service_id) AS (
        VALUES ${Prisma.join(requested.map((id) => Prisma.sql`(${id}::uuid)`))}
      ),
      current_assignments AS (
        SELECT assignment.database_service_id, assignment.crawler_id
        FROM "celesnity_app"."database_metadata_crawlers" assignment
        JOIN requested req ON req.database_service_id = assignment.database_service_id
        JOIN "celesnity_app"."metadata_crawlers" crawler
          ON crawler.id = assignment.crawler_id
          AND crawler.enabled = TRUE
          AND crawler.archived_at IS NULL
        WHERE assignment.organization_id = ${organizationId}::uuid
      ),
      eligible_namespaces AS (
        SELECT n.*, run.finished_at, run.started_at, run.queued_at
        FROM "celesnity_app"."catalog_namespaces" n
        JOIN current_assignments assignment
          ON assignment.database_service_id = n.database_service_id
        JOIN "celesnity_app"."metadata_crawler_runs" run
          ON run.id = n.last_seen_run_id
          AND run.crawler_id = assignment.crawler_id
          AND run.status IN (
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[0]}::"celesnity_app"."MetadataCrawlerRunStatus",
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[1]}::"celesnity_app"."MetadataCrawlerRunStatus"
          )
        WHERE n.organization_id = ${organizationId}::uuid AND n.deleted_at IS NULL
      ),
      eligible_relations AS (
        SELECT r.*
        FROM "celesnity_app"."catalog_relations" r
        JOIN eligible_namespaces n ON n.id = r.namespace_id
        JOIN current_assignments assignment
          ON assignment.database_service_id = n.database_service_id
        JOIN "celesnity_app"."metadata_crawler_runs" run
          ON run.id = r.last_seen_run_id
          AND run.crawler_id = assignment.crawler_id
          AND run.status IN (
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[0]}::"celesnity_app"."MetadataCrawlerRunStatus",
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[1]}::"celesnity_app"."MetadataCrawlerRunStatus"
          )
        WHERE r.organization_id = ${organizationId}::uuid AND r.deleted_at IS NULL
      ),
      namespace_counts AS (
        SELECT
          n.database_service_id,
          COUNT(*) FILTER (WHERE n.namespace_type = 'DATABASE') AS database_count,
          COUNT(*) FILTER (WHERE n.namespace_type = 'SCHEMA') AS schema_count,
          MAX(COALESCE(n.finished_at, n.started_at, n.queued_at)) AS last_crawled_at
        FROM eligible_namespaces n
        GROUP BY n.database_service_id
      ),
      relation_counts AS (
        SELECT n.database_service_id, COUNT(r.id) AS relation_count
        FROM eligible_namespaces n
        JOIN eligible_relations r ON r.namespace_id = n.id
        GROUP BY n.database_service_id
      ),
      column_counts AS (
        SELECT n.database_service_id, COUNT(c.id) AS column_count
        FROM eligible_namespaces n
        JOIN eligible_relations r ON r.namespace_id = n.id
        JOIN "celesnity_app"."catalog_columns" c
          ON c.relation_id = r.id AND c.deleted_at IS NULL
        GROUP BY n.database_service_id
      ),
      constraint_counts AS (
        SELECT n.database_service_id, COUNT(c.id) AS constraint_count
        FROM eligible_namespaces n
        JOIN eligible_relations r ON r.namespace_id = n.id
        JOIN "celesnity_app"."catalog_constraints" c
          ON c.relation_id = r.id AND c.deleted_at IS NULL
        GROUP BY n.database_service_id
      )
      SELECT
        requested.database_service_id,
        COALESCE(namespace_counts.database_count, 0) AS database_count,
        COALESCE(namespace_counts.schema_count, 0) AS schema_count,
        COALESCE(relation_counts.relation_count, 0) AS relation_count,
        COALESCE(column_counts.column_count, 0) AS column_count,
        COALESCE(constraint_counts.constraint_count, 0) AS constraint_count,
        namespace_counts.last_crawled_at
      FROM requested
      LEFT JOIN namespace_counts USING (database_service_id)
      LEFT JOIN relation_counts USING (database_service_id)
      LEFT JOIN column_counts USING (database_service_id)
      LEFT JOIN constraint_counts USING (database_service_id)
    `);
    const byService = new Map(rows.map((row) => [row.database_service_id, toSummary(row)]));
    return new Map(requested.map((id) => [id, byService.get(id) ?? emptySummary()]));
  }

  public async listNamespaces(
    databaseServiceId: string,
    query: SourceMetadataPageRequest<SourceNamespaceSort>,
  ): Promise<SourceMetadataPage<SourceNamespaceView>> {
    const organizationId = this.contexts.require().organizationId;
    const search = query.search?.trim() || null;
    const offset = (query.page - 1) * query.pageSize;
    const order = namespaceOrder(query.sortBy);
    const direction = directionSql(query.sortDirection);
    const [rows, totalRows] = await Promise.all([
      this.prisma.client.$queryRaw<NamespaceRow[]>(Prisma.sql`
        SELECT
          n.id,
          n.name,
          n.namespace_type,
          n.description,
          COUNT(r.id) FILTER (WHERE relation_run.id IS NOT NULL) AS relation_count,
          MAX(COALESCE(run.finished_at, run.started_at, run.queued_at)) AS last_crawled_at
        FROM "celesnity_app"."catalog_namespaces" n
        JOIN "celesnity_app"."database_metadata_crawlers" assignment
          ON assignment.database_service_id = n.database_service_id
          AND assignment.organization_id = ${organizationId}::uuid
        JOIN "celesnity_app"."metadata_crawlers" crawler
          ON crawler.id = assignment.crawler_id
          AND crawler.enabled = TRUE
          AND crawler.archived_at IS NULL
        JOIN "celesnity_app"."metadata_crawler_runs" run
          ON run.id = n.last_seen_run_id
          AND run.crawler_id = assignment.crawler_id
          AND run.status IN (
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[0]}::"celesnity_app"."MetadataCrawlerRunStatus",
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[1]}::"celesnity_app"."MetadataCrawlerRunStatus"
          )
        LEFT JOIN "celesnity_app"."catalog_relations" r
          ON r.namespace_id = n.id AND r.deleted_at IS NULL
        LEFT JOIN "celesnity_app"."metadata_crawler_runs" relation_run
          ON relation_run.id = r.last_seen_run_id
          AND relation_run.crawler_id = assignment.crawler_id
          AND relation_run.status IN (
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[0]}::"celesnity_app"."MetadataCrawlerRunStatus",
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[1]}::"celesnity_app"."MetadataCrawlerRunStatus"
          )
        WHERE n.database_service_id = ${databaseServiceId}::uuid
          AND n.organization_id = ${organizationId}::uuid
          AND n.deleted_at IS NULL
          AND (${search}::text IS NULL OR n.name ILIKE '%' || ${search} || '%')
        GROUP BY n.id, n.name, n.namespace_type, n.description
        ORDER BY ${order} ${direction} NULLS LAST, n.id ASC
        LIMIT ${query.pageSize} OFFSET ${offset}
      `),
      this.prisma.client.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM "celesnity_app"."catalog_namespaces" n
        JOIN "celesnity_app"."database_metadata_crawlers" assignment
          ON assignment.database_service_id = n.database_service_id
          AND assignment.organization_id = ${organizationId}::uuid
        JOIN "celesnity_app"."metadata_crawlers" crawler
          ON crawler.id = assignment.crawler_id
          AND crawler.enabled = TRUE
          AND crawler.archived_at IS NULL
        JOIN "celesnity_app"."metadata_crawler_runs" run
          ON run.id = n.last_seen_run_id
          AND run.crawler_id = assignment.crawler_id
          AND run.status IN (
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[0]}::"celesnity_app"."MetadataCrawlerRunStatus",
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[1]}::"celesnity_app"."MetadataCrawlerRunStatus"
          )
        WHERE n.database_service_id = ${databaseServiceId}::uuid
          AND n.organization_id = ${organizationId}::uuid
          AND n.deleted_at IS NULL
          AND (${search}::text IS NULL OR n.name ILIKE '%' || ${search} || '%')
      `),
    ]);
    const total = toCount(totalRows[0]?.total ?? 0);
    return page(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.namespace_type,
        description: optionalString(row.description),
        relationCount: toCount(row.relation_count),
        lastCrawledAt: optionalDate(row.last_crawled_at),
      })),
      query,
      total,
    );
  }

  public async listRelations(
    databaseServiceId: string,
    namespaceId: string,
    query: SourceMetadataPageRequest<SourceRelationSort>,
  ): Promise<SourceMetadataPage<SourceRelationView> | undefined> {
    const organizationId = this.contexts.require().organizationId;
    const namespace = await this.prisma.client.catalogNamespace.findFirst({
      where: {
        id: namespaceId,
        databaseServiceId,
        deletedAt: null,
        lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
      },
      select: { id: true },
    });
    if (namespace === null) return undefined;
    const search = query.search?.trim() || null;
    const offset = (query.page - 1) * query.pageSize;
    const order = relationOrder(query.sortBy);
    const direction = directionSql(query.sortDirection);
    const [rows, totalRows] = await Promise.all([
      this.prisma.client.$queryRaw<RelationRow[]>(Prisma.sql`
        SELECT
          r.id,
          r.namespace_id,
          r.name,
          r.relation_type,
          r.description,
          COUNT(c.id) AS column_count,
          r.ddl,
          r.properties,
          MAX(COALESCE(run.finished_at, run.started_at, run.queued_at)) AS last_crawled_at
        FROM "celesnity_app"."catalog_relations" r
        JOIN "celesnity_app"."metadata_crawler_runs" run
          ON run.id = r.last_seen_run_id
          AND run.status IN (
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[0]}::"celesnity_app"."MetadataCrawlerRunStatus",
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[1]}::"celesnity_app"."MetadataCrawlerRunStatus"
          )
        JOIN "celesnity_app"."database_metadata_crawlers" assignment
          ON assignment.crawler_id = run.crawler_id
          AND assignment.database_service_id = ${databaseServiceId}::uuid
          AND assignment.organization_id = ${organizationId}::uuid
        JOIN "celesnity_app"."metadata_crawlers" crawler
          ON crawler.id = assignment.crawler_id
          AND crawler.enabled = TRUE
          AND crawler.archived_at IS NULL
        LEFT JOIN "celesnity_app"."catalog_columns" c
          ON c.relation_id = r.id AND c.deleted_at IS NULL
        WHERE r.namespace_id = ${namespaceId}::uuid
          AND r.organization_id = ${organizationId}::uuid
          AND r.deleted_at IS NULL
          AND (${search}::text IS NULL OR r.name ILIKE '%' || ${search} || '%')
        GROUP BY r.id, r.namespace_id, r.name, r.relation_type, r.description, r.ddl, r.properties
        ORDER BY ${order} ${direction} NULLS LAST, r.id ASC
        LIMIT ${query.pageSize} OFFSET ${offset}
      `),
      this.prisma.client.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM "celesnity_app"."catalog_relations" r
        JOIN "celesnity_app"."metadata_crawler_runs" run
          ON run.id = r.last_seen_run_id
          AND run.status IN (
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[0]}::"celesnity_app"."MetadataCrawlerRunStatus",
            ${CURRENT_METADATA_SNAPSHOT_STATUSES[1]}::"celesnity_app"."MetadataCrawlerRunStatus"
          )
        JOIN "celesnity_app"."database_metadata_crawlers" assignment
          ON assignment.crawler_id = run.crawler_id
          AND assignment.database_service_id = ${databaseServiceId}::uuid
          AND assignment.organization_id = ${organizationId}::uuid
        JOIN "celesnity_app"."metadata_crawlers" crawler
          ON crawler.id = assignment.crawler_id
          AND crawler.enabled = TRUE
          AND crawler.archived_at IS NULL
        WHERE r.namespace_id = ${namespaceId}::uuid
          AND r.organization_id = ${organizationId}::uuid
          AND r.deleted_at IS NULL
          AND (${search}::text IS NULL OR r.name ILIKE '%' || ${search} || '%')
      `),
    ]);
    const total = toCount(totalRows[0]?.total ?? 0);
    return page(
      rows.map((row) => ({
        id: row.id,
        namespaceId: row.namespace_id,
        name: row.name,
        relationType: row.relation_type,
        description: optionalString(row.description),
        columnCount: toCount(row.column_count),
        ddl: optionalString(row.ddl),
        properties: jsonObject(row.properties),
        lastCrawledAt: optionalDate(row.last_crawled_at),
      })),
      query,
      total,
    );
  }

  public async findRelation(
    databaseServiceId: string,
    relationId: string,
  ): Promise<SourceRelationView | undefined> {
    const row = await this.prisma.client.catalogRelation.findFirst({
      where: {
        id: relationId,
        deletedAt: null,
        lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
        namespace: {
          databaseServiceId,
          deletedAt: null,
          lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
        },
      },
      select: {
        id: true,
        namespaceId: true,
        name: true,
        relationType: true,
        description: true,
        ddl: true,
        properties: true,
        lastSeenRun: { select: { finishedAt: true, startedAt: true, queuedAt: true } },
        _count: { select: { columns: { where: { deletedAt: null } } } },
      },
    });
    if (row === null) return undefined;
    return {
      id: row.id,
      namespaceId: row.namespaceId,
      name: row.name,
      relationType: row.relationType,
      description: optionalString(row.description),
      columnCount: row._count.columns,
      ddl: optionalString(row.ddl),
      properties: jsonObject(row.properties),
      lastCrawledAt: runDate(row.lastSeenRun),
    };
  }

  public async listColumns(
    databaseServiceId: string,
    relationId: string,
    query: SourceMetadataPageRequest<SourceColumnSort>,
  ): Promise<SourceMetadataPage<SourceColumnView> | undefined> {
    const relation = await this.prisma.client.catalogRelation.findFirst({
      where: {
        id: relationId,
        deletedAt: null,
        lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
        namespace: {
          databaseServiceId,
          deletedAt: null,
          lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
        },
      },
      select: { id: true },
    });
    if (relation === null) return undefined;
    const where = {
      relationId,
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
    };
    const orderBy = columnOrder(query.sortBy, query.sortDirection);
    const [rows, total] = await Promise.all([
      this.prisma.client.catalogColumn.findMany({
        where,
        orderBy: [...orderBy, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.catalogColumn.count({ where }),
    ]);
    return page(
      rows.map((row) => ({
        id: row.id,
        relationId: row.relationId,
        name: row.name,
        ordinalPosition: row.ordinalPosition,
        nativeType: row.nativeType,
        canonicalType: row.canonicalType,
        nullable: row.nullable,
        defaultValue: optionalString(row.defaultValue),
        description: optionalString(row.description),
        properties: jsonObject(row.properties),
      })),
      query,
      total,
    );
  }

  public async listConstraints(
    databaseServiceId: string,
    relationId: string,
  ): Promise<readonly SourceConstraintView[] | undefined> {
    const rows = await this.prisma.client.catalogConstraint.findMany({
      where: {
        relationId,
        deletedAt: null,
        relation: {
          deletedAt: null,
          lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
          namespace: {
            databaseServiceId,
            deletedAt: null,
            lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
          },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        columns: {
          include: { column: { select: { name: true, deletedAt: true } } },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (rows.length === 0) {
      const relation = await this.prisma.client.catalogRelation.findFirst({
        where: {
          id: relationId,
          deletedAt: null,
          lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
          namespace: {
            databaseServiceId,
            deletedAt: null,
            lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
          },
        },
        select: { id: true },
      });
      return relation === null ? undefined : [];
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      constraintType: row.constraintType,
      columns: row.columns
        .filter((item) => item.column.deletedAt === null)
        .map((item) => ({
          name: item.column.name,
          position: item.position,
          referencedColumnName: optionalString(item.referencedColumnName),
        })),
      referencedRelationPath: optionalString(row.referencedRelationPath),
      checkExpression: optionalString(row.checkExpression),
      properties: jsonObject(row.properties),
    }));
  }
}

function page<T>(
  items: readonly T[],
  query: SourceMetadataPageRequest<string>,
  total: number,
): SourceMetadataPage<T> {
  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
    sort: { field: query.sortBy, direction: query.sortDirection },
  };
}

function namespaceOrder(field: SourceNamespaceSort): Prisma.Sql {
  switch (field) {
    case 'name':
      return Prisma.sql`n.name`;
    case 'relationCount':
      return Prisma.sql`relation_count`;
    case 'lastCrawledAt':
      return Prisma.sql`last_crawled_at`;
  }
}

function relationOrder(field: SourceRelationSort): Prisma.Sql {
  switch (field) {
    case 'name':
      return Prisma.sql`r.name`;
    case 'relationType':
      return Prisma.sql`r.relation_type`;
    case 'columnCount':
      return Prisma.sql`column_count`;
    case 'lastCrawledAt':
      return Prisma.sql`last_crawled_at`;
  }
}

function directionSql(direction: 'asc' | 'desc'): Prisma.Sql {
  return direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
}

function columnOrder(
  field: SourceColumnSort,
  direction: 'asc' | 'desc',
): Array<Record<string, 'asc' | 'desc'>> {
  switch (field) {
    case 'ordinalPosition':
      return [{ ordinalPosition: direction }];
    case 'name':
      return [{ name: direction }];
    case 'nativeType':
      return [{ nativeType: direction }];
    case 'nullable':
      return [{ nullable: direction }];
  }
}

function toCount(value: bigint | number): number {
  const count = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Catalog count is out of range.');
  return count;
}

function emptySummary(): SourceMetadataSnapshotSummary {
  return {
    hasSnapshot: false,
    databaseCount: 0,
    schemaCount: 0,
    relationCount: 0,
    columnCount: 0,
    constraintCount: 0,
  };
}

function toSummary(row: SummaryRow): SourceMetadataSnapshotSummary {
  const databaseCount = toCount(row.database_count);
  const schemaCount = toCount(row.schema_count);
  const relationCount = toCount(row.relation_count);
  const columnCount = toCount(row.column_count);
  const constraintCount = toCount(row.constraint_count);
  return {
    hasSnapshot: databaseCount + schemaCount + relationCount + columnCount + constraintCount > 0,
    databaseCount,
    schemaCount,
    relationCount,
    columnCount,
    constraintCount,
    lastCrawledAt: optionalDate(row.last_crawled_at),
  };
}

function optionalString(value: string | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : value;
}

function optionalDate(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function runDate(
  value: { finishedAt: Date | null; startedAt: Date | null; queuedAt: Date } | null,
): string | undefined {
  return optionalDate(value?.finishedAt ?? value?.startedAt ?? value?.queuedAt);
}

function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  return {};
}
