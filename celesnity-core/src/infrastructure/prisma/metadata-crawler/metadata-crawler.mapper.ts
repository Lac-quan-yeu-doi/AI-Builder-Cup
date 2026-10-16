import { Injectable } from '@nestjs/common';
import type { Prisma } from '@generated/prisma/client';
import type {
  MetadataCrawlerGetPayload,
  MetadataCrawlerModel,
  MetadataCrawlerSelect,
} from '@generated/prisma/models/MetadataCrawler';
import type {
  MetadataCrawlerRunGetPayload,
  MetadataCrawlerRunSelect,
} from '@generated/prisma/models/MetadataCrawlerRun';
import type {
  MetadataCrawlerView,
  MetadataCrawlerRunView,
} from '@application/metadata-crawler/read-models/metadata-crawler.view';
import { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';
import { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import type { MetadataCrawlerRunFailure } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';
import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';

export const METADATA_CRAWLER_SELECTION = {
  id: true,
  name: true,
  serviceFamily: true,
  enabled: true,
  scheduleCron: true,
  scheduleTimezone: true,
  nextRunAt: true,
  concurrencyPolicy: true,
  timeoutSeconds: true,
  revision: true,
  discoveryConfig: true,
  configSchemaVersion: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  databaseMetadataCrawler: { select: { databaseServiceId: true } },
} as const satisfies MetadataCrawlerSelect;

export const METADATA_CRAWLER_RUN_SELECTION = {
  id: true,
  organizationId: true,
  crawlerId: true,
  triggerType: true,
  status: true,
  deduplicationKey: true,
  scheduledFor: true,
  queuedAt: true,
  claimedAt: true,
  startedAt: true,
  finishedAt: true,
  heartbeatAt: true,
  leaseExpiresAt: true,
  workerId: true,
  attempt: true,
  crawlerRevision: true,
  connectorTypeSnapshot: true,
  safeConfigSnapshot: true,
  databaseCount: true,
  schemaCount: true,
  relationCount: true,
  columnCount: true,
  createdCount: true,
  updatedCount: true,
  unchangedCount: true,
  deletedCount: true,
  warningCount: true,
  errorCategory: true,
  errorSummary: true,
  logObjectKey: true,
} as const satisfies MetadataCrawlerRunSelect;

export type MetadataCrawlerRecord = MetadataCrawlerGetPayload<{
  select: typeof METADATA_CRAWLER_SELECTION;
}>;
export type MetadataCrawlerRunRecord = MetadataCrawlerRunGetPayload<{
  select: typeof METADATA_CRAWLER_RUN_SELECTION;
}>;

export type MetadataCrawlerPersistenceValues = Omit<
  MetadataCrawlerModel,
  'id' | 'createdAt' | 'updatedAt' | 'discoveryConfig'
> & { readonly discoveryConfig: Prisma.InputJsonValue };

@Injectable()
export class MetadataCrawlerMapper {
  public toDomain(record: MetadataCrawlerRecord): MetadataCrawler {
    const assignment = record.databaseMetadataCrawler;
    if (assignment === null) {
      throw MetadataCrawlerError.validation(
        'Persisted metadata crawler is missing its database-service assignment.',
      );
    }
    return MetadataCrawler.rehydrate({
      id: record.id,
      databaseServiceId: assignment.databaseServiceId,
      name: record.name,
      serviceFamily: record.serviceFamily,
      enabled: record.enabled,
      scheduleCron: record.scheduleCron,
      scheduleTimezone: record.scheduleTimezone,
      nextRunAt: record.nextRunAt,
      concurrencyPolicy: record.concurrencyPolicy,
      timeoutSeconds: record.timeoutSeconds,
      revision: record.revision,
      discoveryConfig: asJsonObject(record.discoveryConfig),
      configSchemaVersion: record.configSchemaVersion,
      archivedAt: record.archivedAt ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  public toInsertPersistence(crawler: MetadataCrawler): Prisma.MetadataCrawlerCreateInput {
    return {
      id: crawler.id,
      name: crawler.name,
      serviceFamily: crawler.serviceFamily,
      enabled: crawler.enabled,
      scheduleCron: crawler.scheduleCron,
      scheduleTimezone: crawler.scheduleTimezone,
      nextRunAt: crawler.nextRunAt,
      concurrencyPolicy: crawler.concurrencyPolicy,
      timeoutSeconds: crawler.timeoutSeconds,
      revision: crawler.revision,
      discoveryConfig: crawler.discoveryConfig as Prisma.InputJsonValue,
      configSchemaVersion: crawler.configSchemaVersion,
      archivedAt: crawler.archivedAt ?? null,
      createdAt: crawler.createdAt,
      updatedAt: crawler.updatedAt,
    };
  }

  public toPersistence(crawler: MetadataCrawler): Prisma.MetadataCrawlerUpdateManyMutationInput {
    return {
      name: crawler.name,
      enabled: crawler.enabled,
      scheduleCron: crawler.scheduleCron,
      scheduleTimezone: crawler.scheduleTimezone,
      nextRunAt: crawler.nextRunAt,
      timeoutSeconds: crawler.timeoutSeconds,
      revision: crawler.revision,
      discoveryConfig: crawler.discoveryConfig as Prisma.InputJsonValue,
      archivedAt: crawler.archivedAt ?? null,
      updatedAt: crawler.updatedAt,
    };
  }

  public toView(record: MetadataCrawlerRecord): MetadataCrawlerView {
    const crawler = this.toDomain(record);
    return {
      id: crawler.id,
      databaseServiceId: crawler.databaseServiceId,
      name: crawler.name,
      serviceFamily: crawler.serviceFamily,
      enabled: crawler.enabled,
      scheduleCron: crawler.scheduleCron,
      scheduleTimezone: crawler.scheduleTimezone,
      nextRunAt: crawler.nextRunAt.toISOString(),
      concurrencyPolicy: crawler.concurrencyPolicy,
      timeoutSeconds: crawler.timeoutSeconds,
      revision: crawler.revision,
      discoveryConfig: crawler.discoveryConfig,
      archivedAt: crawler.archivedAt?.toISOString(),
      createdAt: crawler.createdAt.toISOString(),
      updatedAt: crawler.updatedAt.toISOString(),
    };
  }

  public toDomainRun(record: MetadataCrawlerRunRecord): MetadataCrawlerRun {
    return MetadataCrawlerRun.rehydrate({
      id: record.id,
      organizationId: record.organizationId,
      crawlerId: record.crawlerId,
      triggerType: record.triggerType,
      status: record.status,
      deduplicationKey: record.deduplicationKey,
      scheduledFor: record.scheduledFor ?? undefined,
      queuedAt: record.queuedAt,
      claimedAt: record.claimedAt ?? undefined,
      startedAt: record.startedAt ?? undefined,
      finishedAt: record.finishedAt ?? undefined,
      heartbeatAt: record.heartbeatAt ?? undefined,
      leaseExpiresAt: record.leaseExpiresAt ?? undefined,
      workerId: record.workerId ?? undefined,
      attempt: record.attempt,
      crawlerRevision: record.crawlerRevision,
      connectorTypeSnapshot: record.connectorTypeSnapshot,
      safeConfigSnapshot: asJsonObject(record.safeConfigSnapshot),
      counters: {
        databaseCount: record.databaseCount,
        schemaCount: record.schemaCount,
        relationCount: record.relationCount,
        columnCount: record.columnCount,
        createdCount: record.createdCount,
        updatedCount: record.updatedCount,
        unchangedCount: record.unchangedCount,
        deletedCount: record.deletedCount,
        warningCount: record.warningCount,
      },
      failure: toFailure(record),
      logObjectKey: record.logObjectKey ?? undefined,
    });
  }

  public toRunInsertPersistence(
    run: MetadataCrawlerRun,
  ): Prisma.MetadataCrawlerRunUncheckedCreateInput {
    const counters = run.counters;
    return {
      id: run.id,
      ...(run.organizationId === undefined ? {} : { organizationId: run.organizationId }),
      crawlerId: run.crawlerId,
      triggerType: run.triggerType,
      status: run.status,
      deduplicationKey: run.deduplicationKey,
      scheduledFor: run.scheduledFor ?? null,
      queuedAt: run.queuedAt,
      claimedAt: run.claimedAt ?? null,
      startedAt: run.startedAt ?? null,
      finishedAt: run.finishedAt ?? null,
      heartbeatAt: run.heartbeatAt ?? null,
      leaseExpiresAt: run.leaseExpiresAt ?? null,
      workerId: run.workerId ?? null,
      attempt: run.attempt,
      crawlerRevision: run.crawlerRevision,
      connectorTypeSnapshot: run.connectorTypeSnapshot,
      safeConfigSnapshot: run.safeConfigSnapshot as Prisma.InputJsonValue,
      databaseCount: counters.databaseCount,
      schemaCount: counters.schemaCount,
      relationCount: counters.relationCount,
      columnCount: counters.columnCount,
      createdCount: counters.createdCount,
      updatedCount: counters.updatedCount,
      unchangedCount: counters.unchangedCount,
      deletedCount: counters.deletedCount,
      warningCount: counters.warningCount,
      errorCategory: run.failure?.category ?? null,
      errorSummary: run.failure?.summary ?? null,
      logObjectKey: run.logObjectKey ?? null,
    };
  }

  public toRunPersistence(
    run: MetadataCrawlerRun,
  ): Prisma.MetadataCrawlerRunUpdateManyMutationInput {
    const counters = run.counters;
    return {
      status: run.status,
      scheduledFor: run.scheduledFor ?? null,
      queuedAt: run.queuedAt,
      claimedAt: run.claimedAt ?? null,
      startedAt: run.startedAt ?? null,
      finishedAt: run.finishedAt ?? null,
      heartbeatAt: run.heartbeatAt ?? null,
      leaseExpiresAt: run.leaseExpiresAt ?? null,
      workerId: run.workerId ?? null,
      attempt: run.attempt,
      databaseCount: counters.databaseCount,
      schemaCount: counters.schemaCount,
      relationCount: counters.relationCount,
      columnCount: counters.columnCount,
      createdCount: counters.createdCount,
      updatedCount: counters.updatedCount,
      unchangedCount: counters.unchangedCount,
      deletedCount: counters.deletedCount,
      warningCount: counters.warningCount,
      errorCategory: run.failure?.category ?? null,
      errorSummary: run.failure?.summary ?? null,
      logObjectKey: run.logObjectKey ?? null,
    };
  }

  public toRunView(record: MetadataCrawlerRunRecord): MetadataCrawlerRunView {
    const run = this.toDomainRun(record);
    return {
      id: run.id,
      crawlerId: run.crawlerId,
      triggerType: run.triggerType,
      status: run.status,
      scheduledFor: run.scheduledFor?.toISOString(),
      queuedAt: run.queuedAt.toISOString(),
      claimedAt: run.claimedAt?.toISOString(),
      startedAt: run.startedAt?.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
      heartbeatAt: run.heartbeatAt?.toISOString(),
      leaseExpiresAt: run.leaseExpiresAt?.toISOString(),
      workerId: run.workerId,
      attempt: run.attempt,
      crawlerRevision: run.crawlerRevision,
      connectorTypeSnapshot: run.connectorTypeSnapshot,
      safeConfigSnapshot: run.safeConfigSnapshot,
      counters: run.counters,
      failure: run.failure,
      logObjectKey: run.logObjectKey,
    };
  }
}

function asJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw MetadataCrawlerError.validation('Metadata crawler JSON snapshot must be an object.');
  }
  return value;
}

function toFailure(
  record: Pick<MetadataCrawlerRunRecord, 'errorCategory' | 'errorSummary'>,
): MetadataCrawlerRunFailure | undefined {
  if (record.errorCategory === null && record.errorSummary === null) {
    return undefined;
  }
  return {
    category: record.errorCategory ?? 'UNKNOWN',
    summary: record.errorSummary ?? 'Metadata crawler run failed.',
  };
}
