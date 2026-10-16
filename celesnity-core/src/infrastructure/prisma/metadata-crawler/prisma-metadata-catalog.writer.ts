import { createHash } from 'node:crypto';
import type { Prisma } from '@generated/prisma/client';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type {
  DiscoveredNamespace,
  RelationMetadata,
} from '@application/metadata-crawler/interfaces/i-database-metadata-source';
import type {
  MetadataChangeCounts,
  MetadataCatalogWriteResult,
  IMetadataCatalogWriter,
  MetadataScopeCounts,
  SanitizedCrawlerFailure,
} from '@application/metadata-crawler/interfaces/i-metadata-catalog-writer';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

export class PrismaMetadataCatalogWriter implements IMetadataCatalogWriter {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IIdGenerator,
  ) {}

  public static sourceHash(value: unknown): string {
    const canonical = JSON.stringify(canonicalize(value));
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  public async beginScope(runId: string, scope: DiscoveredNamespace, now: Date): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      await tx.metadataCrawlerRunScope.upsert({
        where: { runId_scopeKey: { runId, scopeKey: scope.deletionScopeKey } },
        create: {
          id: this.ids.next(),
          runId,
          scopeKey: scope.deletionScopeKey,
          scopeType: scope.type,
          status: 'RUNNING',
          startedAt: now,
        },
        update: {
          scopeType: scope.type,
          status: 'RUNNING',
          discoveredCount: 0,
          relationCount: 0,
          columnCount: 0,
          errorCategory: null,
          errorSummary: null,
          startedAt: now,
          finishedAt: null,
        },
      });
      const serviceId = await this.resolveDatabaseServiceId(tx, runId);
      const parentId =
        scope.parentCanonicalPath === undefined
          ? null
          : ((
              await tx.catalogNamespace.findUnique({
                where: {
                  databaseServiceId_canonicalPath: {
                    databaseServiceId: serviceId,
                    canonicalPath: scope.parentCanonicalPath,
                  },
                },
                select: { id: true },
              })
            )?.id ?? null);
      await tx.catalogNamespace.upsert({
        where: {
          databaseServiceId_canonicalPath: {
            databaseServiceId: serviceId,
            canonicalPath: scope.canonicalPath,
          },
        },
        create: {
          id: this.ids.next(),
          databaseServiceId: serviceId,
          parentId,
          namespaceType: scope.type,
          name: scope.name,
          canonicalPath: scope.canonicalPath,
          nativeIdentifier: scope.nativeIdentifier,
          deletionScopeKey: scope.deletionScopeKey,
          description: scope.description ?? null,
          sourceHash: PrismaMetadataCatalogWriter.sourceHash(scope),
          properties: scope.properties,
          firstSeenRunId: runId,
          lastSeenRunId: runId,
        },
        update: {
          parentId,
          namespaceType: scope.type,
          name: scope.name,
          nativeIdentifier: scope.nativeIdentifier,
          deletionScopeKey: scope.deletionScopeKey,
          description: scope.description ?? null,
          sourceHash: PrismaMetadataCatalogWriter.sourceHash(scope),
          properties: scope.properties,
          lastSeenRunId: runId,
          deletedAt: null,
        },
      });
    });
  }

  public async upsertRelationGraph(
    input: RelationMetadata,
    runId: string,
    now: Date,
  ): Promise<MetadataCatalogWriteResult> {
    void now;
    return this.prisma.transaction(async (tx) => {
      const serviceId = await this.resolveDatabaseServiceId(tx, runId);
      const relation = input.relation;
      const namespacePath = relation.namespaceCanonicalPath;
      const namespaceType = relation.namespaceType ?? inferNamespaceType(namespacePath);
      const namespaceName = lastPathPart(namespacePath);
      const namespaceHash = PrismaMetadataCatalogWriter.sourceHash({
        type: namespaceType,
        name: namespaceName,
        canonicalPath: namespacePath,
        nativeIdentifier: namespaceName,
        properties: {},
      });
      const namespace = await tx.catalogNamespace.upsert({
        where: {
          databaseServiceId_canonicalPath: {
            databaseServiceId: serviceId,
            canonicalPath: namespacePath,
          },
        },
        create: {
          id: this.ids.next(),
          databaseServiceId: serviceId,
          namespaceType,
          name: namespaceName,
          canonicalPath: namespacePath,
          nativeIdentifier: namespaceName,
          deletionScopeKey: relation.deletionScopeKey,
          description: null,
          sourceHash: namespaceHash,
          properties: {},
          firstSeenRunId: runId,
          lastSeenRunId: runId,
        },
        update: {
          namespaceType,
          name: namespaceName,
          nativeIdentifier: namespaceName,
          deletionScopeKey: relation.deletionScopeKey,
          sourceHash: namespaceHash,
          lastSeenRunId: runId,
          deletedAt: null,
        },
      });
      const relationHash = PrismaMetadataCatalogWriter.sourceHash({
        relation,
        ddl: input.ddl,
        columns: input.columns,
        constraints: input.constraints,
      });
      const existingRelation = await tx.catalogRelation.findUnique({
        where: { namespaceId_name: { namespaceId: namespace.id, name: relation.name } },
      });
      const storedRelation = await tx.catalogRelation.upsert({
        where: { namespaceId_name: { namespaceId: namespace.id, name: relation.name } },
        create: {
          id: this.ids.next(),
          namespaceId: namespace.id,
          name: relation.name,
          canonicalPath: relation.canonicalPath,
          relationType: relation.type,
          nativeIdentifier: relation.nativeIdentifier,
          deletionScopeKey: relation.deletionScopeKey,
          description: relation.description ?? null,
          ddl: input.ddl ?? null,
          sourceHash: relationHash,
          properties: relation.properties,
          firstSeenRunId: runId,
          lastSeenRunId: runId,
        },
        update: {
          canonicalPath: relation.canonicalPath,
          relationType: relation.type,
          nativeIdentifier: relation.nativeIdentifier,
          deletionScopeKey: relation.deletionScopeKey,
          description: relation.description ?? null,
          ddl: input.ddl ?? null,
          sourceHash: relationHash,
          properties: relation.properties,
          lastSeenRunId: runId,
          deletedAt: null,
        },
      });

      for (const column of input.columns) {
        const sourceHash = PrismaMetadataCatalogWriter.sourceHash(column);
        await tx.catalogColumn.upsert({
          where: { relationId_name: { relationId: storedRelation.id, name: column.name } },
          create: {
            id: this.ids.next(),
            relationId: storedRelation.id,
            name: column.name,
            ordinalPosition: column.ordinalPosition,
            nativeType: column.nativeType,
            canonicalType: column.canonicalType,
            nullable: column.nullable,
            defaultValue: column.defaultValue ?? null,
            description: column.description ?? null,
            sourceHash,
            properties: column.properties,
            firstSeenRunId: runId,
            lastSeenRunId: runId,
          },
          update: {
            ordinalPosition: column.ordinalPosition,
            nativeType: column.nativeType,
            canonicalType: column.canonicalType,
            nullable: column.nullable,
            defaultValue: column.defaultValue ?? null,
            description: column.description ?? null,
            sourceHash,
            properties: column.properties,
            lastSeenRunId: runId,
            deletedAt: null,
          },
        });
      }

      for (const constraint of input.constraints) {
        const storedConstraint = await tx.catalogConstraint.upsert({
          where: { relationId_name: { relationId: storedRelation.id, name: constraint.name } },
          create: {
            id: this.ids.next(),
            relationId: storedRelation.id,
            name: constraint.name,
            constraintType: constraint.type,
            checkExpression: constraint.checkExpression ?? null,
            referencedRelationPath: constraint.referencedRelationPath ?? null,
            properties: constraint.properties,
            firstSeenRunId: runId,
            lastSeenRunId: runId,
          },
          update: {
            constraintType: constraint.type,
            checkExpression: constraint.checkExpression ?? null,
            referencedRelationPath: constraint.referencedRelationPath ?? null,
            properties: constraint.properties,
            lastSeenRunId: runId,
            deletedAt: null,
          },
        });
        await tx.catalogConstraintColumn.deleteMany({
          where: { constraintId: storedConstraint.id },
        });
        for (const [position, columnName] of constraint.columns.entries()) {
          const column = await tx.catalogColumn.findUnique({
            where: { relationId_name: { relationId: storedRelation.id, name: columnName } },
          });
          if (column === null) continue;
          await tx.catalogConstraintColumn.create({
            data: {
              id: this.ids.next(),
              constraintId: storedConstraint.id,
              columnId: column.id,
              position: position + 1,
              referencedColumnName: constraint.referencedColumns?.[position] ?? null,
            },
          });
        }
      }

      return {
        discovered: {
          databaseCount: 0,
          schemaCount: 0,
          relationCount: 1,
          columnCount: input.columns.length,
        },
        changes: {
          created: existingRelation === null ? 1 : 0,
          updated:
            existingRelation !== null && existingRelation.sourceHash !== relationHash ? 1 : 0,
          unchanged:
            existingRelation !== null && existingRelation.sourceHash === relationHash ? 1 : 0,
          deleted: 0,
        },
      };
    });
  }

  public async completeScope(
    runId: string,
    scopeKey: string,
    counts: MetadataScopeCounts,
    now: Date,
  ): Promise<MetadataChangeCounts> {
    return this.prisma.transaction(async (tx) => {
      const relations = await tx.catalogRelation.findMany({
        where: { deletionScopeKey: scopeKey, lastSeenRunId: { not: runId }, deletedAt: null },
        select: { id: true },
      });
      const relationResult = await tx.catalogRelation.updateMany({
        where: { deletionScopeKey: scopeKey, lastSeenRunId: { not: runId }, deletedAt: null },
        data: { deletedAt: now },
      });
      if (relations.length > 0) {
        const relationIds = relations.map((relation) => relation.id);
        await tx.catalogColumn.updateMany({
          where: {
            relationId: { in: relationIds },
            lastSeenRunId: { not: runId },
            deletedAt: null,
          },
          data: { deletedAt: now },
        });
        await tx.catalogConstraint.updateMany({
          where: {
            relationId: { in: relationIds },
            lastSeenRunId: { not: runId },
            deletedAt: null,
          },
          data: { deletedAt: now },
        });
      }
      await tx.catalogNamespace.updateMany({
        where: { deletionScopeKey: scopeKey, lastSeenRunId: { not: runId }, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.metadataCrawlerRunScope.update({
        where: { runId_scopeKey: { runId, scopeKey } },
        data: {
          status: 'SUCCEEDED',
          discoveredCount: counts.discoveredCount,
          relationCount: counts.relationCount,
          columnCount: counts.columnCount,
          finishedAt: now,
        },
      });
      return { created: 0, updated: 0, unchanged: 0, deleted: relationResult.count };
    });
  }

  public async failScope(
    runId: string,
    scopeKey: string,
    counts: MetadataScopeCounts,
    failure: SanitizedCrawlerFailure,
    now: Date,
  ): Promise<void> {
    await this.prisma.client.metadataCrawlerRunScope.update({
      where: { runId_scopeKey: { runId, scopeKey } },
      data: {
        status: 'FAILED',
        discoveredCount: counts.discoveredCount,
        relationCount: counts.relationCount,
        columnCount: counts.columnCount,
        errorCategory: failure.category,
        errorSummary: failure.summary,
        finishedAt: now,
      },
    });
  }

  private async resolveDatabaseServiceId(
    tx: Prisma.TransactionClient,
    runId: string,
  ): Promise<string> {
    const row = await tx.metadataCrawlerRun.findUnique({
      where: { id: runId },
      select: {
        crawler: { select: { databaseMetadataCrawler: { select: { databaseServiceId: true } } } },
      },
    });
    const databaseServiceId = row?.crawler.databaseMetadataCrawler?.databaseServiceId;
    if (databaseServiceId === undefined) {
      throw new Error('Metadata crawler run is missing its database-service assignment.');
    }
    return databaseServiceId;
  }
}

function canonicalize(value: unknown, key?: string): unknown {
  if (
    key !== undefined &&
    /(?:runid|createdat|updatedat|deletedat|timestamp|seenat)$/iu.test(key)
  ) {
    return undefined;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((childKey) => [childKey, canonicalize(record[childKey], childKey)])
        .filter(([, childValue]) => childValue !== undefined),
    );
  }
  return value;
}

function lastPathPart(path: string): string {
  const part = path.split('/').at(-1) ?? path;
  return part.includes('=') ? part.slice(part.indexOf('=') + 1) : part;
}

function inferNamespaceType(path: string): 'DATABASE' | 'SCHEMA' {
  return path.includes('/schema=') ? 'SCHEMA' : 'DATABASE';
}
