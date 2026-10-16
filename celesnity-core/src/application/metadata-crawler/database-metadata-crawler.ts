import { secretRedactor } from '@application/shared/secret-redactor';
import type {
  DatabaseDiscoveryConfig,
  DatabaseMetadataSource,
  DiscoveredNamespace,
  DiscoveredRelation,
  SanitizedMetadataCrawlerLogger,
} from '@application/metadata-crawler/interfaces/i-database-metadata-source';
import type {
  IMetadataCatalogWriter,
  MetadataChangeCounts,
  MetadataDiscoveryCounts,
  MetadataScopeCounts,
  SanitizedCrawlerFailure,
} from '@application/metadata-crawler/interfaces/i-metadata-catalog-writer';

export interface DatabaseMetadataCrawlerContext {
  readonly runId: string;
  readonly source: DatabaseMetadataSource;
  readonly writer: IMetadataCatalogWriter;
  readonly discovery: DatabaseDiscoveryConfig;
  readonly now: Date;
  readonly signal: AbortSignal;
  readonly logger: SanitizedMetadataCrawlerLogger;
}

export interface DatabaseMetadataCrawlerResult {
  readonly status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  readonly discovery: MetadataDiscoveryCounts;
  readonly changes: MetadataChangeCounts;
  readonly failedScopes: number;
  readonly successfulScopes: number;
}

const DEFAULT_RELATION_CONCURRENCY = 4;

export class DatabaseMetadataCrawler {
  public constructor(private readonly relationConcurrency = DEFAULT_RELATION_CONCURRENCY) {
    if (
      !Number.isInteger(relationConcurrency) ||
      relationConcurrency < 1 ||
      relationConcurrency > 16
    ) {
      throw new Error('Metadata crawler relation concurrency must be between 1 and 16.');
    }
  }

  public async run(
    context: DatabaseMetadataCrawlerContext,
  ): Promise<DatabaseMetadataCrawlerResult> {
    let discovery = emptyDiscovery();
    let changes = emptyChanges();
    let successfulScopes = 0;
    let failedScopes = 0;
    let sawEligibleScope = false;

    try {
      for await (const scope of context.source.listNamespaces()) {
        this.throwIfAborted(context.signal);
        if (!matchesNamespace(scope, context.discovery)) continue;
        sawEligibleScope = true;
        let persisted = namespaceDiscovery(scope);
        try {
          await context.writer.beginScope(context.runId, scope, context.now);
          const scopeResult = await this.processScope(scope, context);
          persisted = addDiscovery(persisted, scopeResult.discovery);
          if (scopeResult.failed) {
            await context.writer.failScope(
              context.runId,
              scope.deletionScopeKey,
              toScopeCounts(persisted),
              scopeResult.failure ?? failure('DISCOVERY', 'Metadata discovery failed.'),
              context.now,
            );
            discovery = addDiscovery(discovery, persisted);
            changes = addChanges(changes, scopeResult.changes);
            failedScopes += 1;
          } else {
            const completed = await context.writer.completeScope(
              context.runId,
              scope.deletionScopeKey,
              toScopeCounts(persisted),
              context.now,
            );
            discovery = addDiscovery(discovery, persisted);
            changes = addChanges(changes, addChanges(scopeResult.changes, completed));
            successfulScopes += 1;
          }
        } catch (error) {
          failedScopes += 1;
          await this.safeFailScope(context, scope, toScopeCounts(persisted), error);
        }
      }
    } catch {
      failedScopes += 1;
      context.logger.warn('metadata_crawler_discovery_failed', { category: 'DISCOVERY' });
      if (!sawEligibleScope) {
        return this.finish(context.source, {
          status: 'FAILED',
          discovery,
          changes,
          failedScopes,
          successfulScopes,
        });
      }
    } finally {
      await context.source.close();
    }

    const status = successfulScopes === 0 ? 'FAILED' : failedScopes === 0 ? 'SUCCEEDED' : 'PARTIAL';
    return { status, discovery, changes, failedScopes, successfulScopes };
  }

  private async processScope(
    scope: DiscoveredNamespace,
    context: DatabaseMetadataCrawlerContext,
  ): Promise<{
    readonly discovery: MetadataDiscoveryCounts;
    readonly changes: MetadataChangeCounts;
    readonly failed: boolean;
    readonly failure?: SanitizedCrawlerFailure;
  }> {
    let discovery = emptyDiscovery();
    let changes = emptyChanges();
    try {
      const relations: DiscoveredRelation[] = [];
      for await (const relation of context.source.listRelations(scope)) {
        this.throwIfAborted(context.signal);
        if (matchesRelation(relation, context.discovery)) relations.push(relation);
      }
      for (let offset = 0; offset < relations.length; offset += this.relationConcurrency) {
        this.throwIfAborted(context.signal);
        const batch = relations.slice(offset, offset + this.relationConcurrency);
        const results = await Promise.all(
          batch.map(async (relation) => {
            this.throwIfAborted(context.signal);
            const detail = await context.source.describeRelation(relation);
            return context.writer.upsertRelationGraph(detail, context.runId, context.now);
          }),
        );
        for (const result of results) {
          discovery = addDiscovery(discovery, result.discovered);
          changes = addChanges(changes, result.changes);
        }
      }
      return { discovery, changes, failed: false };
    } catch (error) {
      return {
        discovery,
        changes,
        failed: true,
        failure: failure('DISCOVERY', secretRedactor.safeErrorMessage(error)),
      };
    }
  }

  private async safeFailScope(
    context: DatabaseMetadataCrawlerContext,
    scope: DiscoveredNamespace,
    counts: MetadataScopeCounts,
    error: unknown,
  ): Promise<void> {
    try {
      await context.writer.failScope(
        context.runId,
        scope.deletionScopeKey,
        counts,
        failure('PERSISTENCE', secretRedactor.safeErrorMessage(error)),
        context.now,
      );
    } catch {
      context.logger.warn('metadata_crawler_scope_failure_persist_failed', {
        category: 'PERSISTENCE',
      });
    }
  }

  private finish(
    source: DatabaseMetadataSource,
    result: DatabaseMetadataCrawlerResult,
  ): DatabaseMetadataCrawlerResult {
    void source;
    return result;
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new Error('Metadata crawler run aborted.');
  }
}

function matchesNamespace(scope: DiscoveredNamespace, discovery: DatabaseDiscoveryConfig): boolean {
  const includes =
    scope.type === 'DATABASE' ? discovery.databaseIncludes : discovery.schemaIncludes;
  const excludes =
    scope.type === 'DATABASE' ? discovery.databaseExcludes : discovery.schemaExcludes;
  return matches(scope, includes, excludes);
}

function matchesRelation(
  relation: DiscoveredRelation,
  discovery: DatabaseDiscoveryConfig,
): boolean {
  if (relation.type === 'VIEW' && !discovery.includeViews) return false;
  if (relation.type === 'MATERIALIZED_VIEW' && !discovery.includeMaterializedViews) return false;
  return matches(relation, discovery.relationIncludes, discovery.relationExcludes);
}

function matches(
  item: { readonly name: string; readonly canonicalPath: string },
  includes: readonly string[],
  excludes: readonly string[],
): boolean {
  if (excludes.some((pattern) => glob(pattern, item.name) || glob(pattern, item.canonicalPath)))
    return false;
  return (
    includes.length === 0 ||
    includes.some((pattern) => glob(pattern, item.name) || glob(pattern, item.canonicalPath))
  );
}

function glob(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*/gu, '.*')
    .replace(/\?/gu, '.');
  return new RegExp(`^${escaped}$`, 'u').test(value);
}

function emptyDiscovery(): MetadataDiscoveryCounts {
  return { databaseCount: 0, schemaCount: 0, relationCount: 0, columnCount: 0 };
}

function emptyChanges(): MetadataChangeCounts {
  return { created: 0, updated: 0, unchanged: 0, deleted: 0 };
}

function namespaceDiscovery(scope: DiscoveredNamespace): MetadataDiscoveryCounts {
  return {
    databaseCount: scope.type === 'DATABASE' ? 1 : 0,
    schemaCount: scope.type === 'SCHEMA' ? 1 : 0,
    relationCount: 0,
    columnCount: 0,
  };
}

function addDiscovery(
  left: MetadataDiscoveryCounts,
  right: MetadataDiscoveryCounts,
): MetadataDiscoveryCounts {
  return {
    databaseCount: left.databaseCount + right.databaseCount,
    schemaCount: left.schemaCount + right.schemaCount,
    relationCount: left.relationCount + right.relationCount,
    columnCount: left.columnCount + right.columnCount,
  };
}

function addChanges(left: MetadataChangeCounts, right: MetadataChangeCounts): MetadataChangeCounts {
  return {
    created: left.created + right.created,
    updated: left.updated + right.updated,
    unchanged: left.unchanged + right.unchanged,
    deleted: left.deleted + right.deleted,
  };
}

function toScopeCounts(counts: MetadataDiscoveryCounts): MetadataScopeCounts {
  return {
    discoveredCount:
      counts.databaseCount + counts.schemaCount + counts.relationCount + counts.columnCount,
    relationCount: counts.relationCount,
    columnCount: counts.columnCount,
  };
}

function failure(
  category: SanitizedCrawlerFailure['category'],
  summary: string,
): SanitizedCrawlerFailure {
  return { category, summary: summary.slice(0, 2000) };
}
