import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { toMetadataCrawlerRunQueuedOutboxMessage } from '@application/metadata-crawler/metadata-crawler-run.outbox.mapper';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';
import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import type { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import type {
  DatabaseDiscoveryConfig,
  DatabaseMetadataCapabilities,
} from '@application/metadata-crawler/interfaces/i-database-metadata-source';
import type { IDatabaseMetadataSourceRegistry } from '@application/metadata-crawler/interfaces/i-database-metadata-source-registry';
import type { IMetadataCrawlerLogStore } from '@application/metadata-crawler/interfaces/i-metadata-crawler-log-store';
import type { IMetadataCrawlerReader } from '@application/metadata-crawler/interfaces/i-metadata-crawler-reader';
import type { IMetadataCrawlerRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-repository';
import type { IMetadataCrawlerRunQueue } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-queue';
import type { ISourceMetadataCatalogReader } from '@application/metadata-crawler/interfaces/i-source-metadata-catalog-reader';
import type {
  DailyMetadataCrawlerSchedule,
  IMetadataCrawlerSchedule,
} from '@application/metadata-crawler/interfaces/i-metadata-crawler-schedule';
import type { SourceMetadataSnapshotSummary } from '@application/metadata-crawler/read-models/source-metadata.view';
import type {
  MetadataCrawlerAssignableDatabaseServiceView,
  MetadataCrawlerDatabaseServiceView,
  MetadataCrawlerDetailsView,
  MetadataCrawlerListPage,
  MetadataCrawlerOperationalState,
  MetadataCrawlerRunView,
  MetadataCrawlerView,
} from '@application/metadata-crawler/read-models/metadata-crawler.view';

const EMPTY_SNAPSHOT_SUMMARY: SourceMetadataSnapshotSummary = {
  hasSnapshot: false,
  databaseCount: 0,
  schemaCount: 0,
  relationCount: 0,
  columnCount: 0,
  constraintCount: 0,
};

export const DEFAULT_DATABASE_DISCOVERY_CONFIG: DatabaseDiscoveryConfig = {
  includeViews: true,
  includeMaterializedViews: true,
  includeDdl: false,
  databaseIncludes: [],
  databaseExcludes: [],
  schemaIncludes: [],
  schemaExcludes: [],
  relationIncludes: [],
  relationExcludes: [],
};

export interface AssignMetadataCrawlerCommand {
  readonly databaseServiceId: string;
  readonly name?: string;
  readonly schedule: DailyMetadataCrawlerSchedule;
  readonly discovery?: Partial<DatabaseDiscoveryConfig>;
  readonly timeoutSeconds?: number;
}

export interface UpdateMetadataCrawlerCommand {
  readonly id: string;
  readonly name?: string;
  readonly enabled?: boolean;
  readonly schedule?: DailyMetadataCrawlerSchedule;
  readonly discovery?: Partial<DatabaseDiscoveryConfig>;
  readonly timeoutSeconds?: number;
}

export class MetadataCrawlerUseCases {
  public constructor(
    private readonly repository: IMetadataCrawlerRepository,
    private readonly reader: IMetadataCrawlerReader,
    private readonly queue: IMetadataCrawlerRunQueue,
    private readonly databaseReader: IDatabaseServiceReader,
    private readonly sourceRegistry: IDatabaseMetadataSourceRegistry,
    private readonly schedule: IMetadataCrawlerSchedule,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly logStore: IMetadataCrawlerLogStore,
    private readonly sourceMetadataReader: ISourceMetadataCatalogReader,
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  public async list(includeArchived = false): Promise<MetadataCrawlerListPage> {
    const views = await this.reader.list(includeArchived);
    const summaries = await this.sourceMetadataReader.summariesByDatabaseServiceIds([
      ...new Set(views.map((view) => view.databaseServiceId)),
    ]);
    const items = await Promise.all(
      views.map((view) => this.withDetails(view, summaries.get(view.databaseServiceId))),
    );
    return { items, total: items.length };
  }

  public async get(id: string): Promise<MetadataCrawlerDetailsView> {
    const view = await this.reader.findById(id);
    if (view === undefined) {
      throw MetadataCrawlerError.notFound();
    }
    const summaries = await this.sourceMetadataReader.summariesByDatabaseServiceIds([
      view.databaseServiceId,
    ]);
    return this.withDetails(view, summaries.get(view.databaseServiceId));
  }

  public async assign(command: AssignMetadataCrawlerCommand): Promise<MetadataCrawlerDetailsView> {
    const service = await this.databaseReader.findActiveById(command.databaseServiceId);
    if (service === undefined) {
      throw MetadataCrawlerError.notFound();
    }
    if (service.verificationStatus !== VerificationStatusValue.SUCCEEDED) {
      throw MetadataCrawlerError.validation(
        'The database service must be verified before assignment.',
      );
    }
    const factory = this.sourceRegistry.require(service.connectorType);
    const discovery = normalizeDiscovery(command.discovery, factory.capabilities);
    validateCapabilities(discovery, factory.capabilities);
    const now = this.clock.now();
    const compiledSchedule = this.schedule.compile(command.schedule);
    const nextRunAt = this.schedule.next(
      compiledSchedule.expression,
      compiledSchedule.timezone,
      now,
    );
    const existing = await this.repository.findByDatabaseServiceId(command.databaseServiceId);

    if (existing !== undefined) {
      if (!existing.isArchived) {
        throw MetadataCrawlerError.assignmentConflict();
      }
      const expectedUpdatedAt = existing.updatedAt;
      existing.restore(now);
      existing.reconfigure(
        {
          name: command.name ?? existing.name,
          scheduleCron: compiledSchedule.expression,
          scheduleTimezone: compiledSchedule.timezone,
          nextRunAt,
          timeoutSeconds: command.timeoutSeconds,
          discoveryConfig: discovery,
        },
        now,
      );
      if (!(await this.repository.update(existing, expectedUpdatedAt))) {
        throw MetadataCrawlerError.concurrency();
      }
      return this.detailsFromAggregate(existing, service, undefined);
    }

    const crawler = MetadataCrawler.create({
      id: this.ids.next(),
      databaseServiceId: command.databaseServiceId,
      name: command.name ?? `${service.name} metadata crawler`,
      serviceFamily: 'DATABASE',
      scheduleCron: compiledSchedule.expression,
      scheduleTimezone: compiledSchedule.timezone,
      nextRunAt,
      timeoutSeconds: command.timeoutSeconds ?? 3600,
      discoveryConfig: discovery,
      now,
    });
    await this.repository.create(crawler);
    return this.detailsFromAggregate(crawler, service, undefined);
  }

  public async update(command: UpdateMetadataCrawlerCommand): Promise<MetadataCrawlerDetailsView> {
    const crawler = await this.requireAggregate(command.id);
    const expectedUpdatedAt = crawler.updatedAt;
    const scheduleChanged = command.schedule !== undefined;
    const compiledSchedule = scheduleChanged ? this.schedule.compile(command.schedule) : undefined;
    const nextRunAt = scheduleChanged
      ? this.schedule.next(
          compiledSchedule!.expression,
          compiledSchedule!.timezone,
          this.clock.now(),
        )
      : undefined;
    const discoveryConfig =
      command.discovery === undefined
        ? undefined
        : await this.normalizeDiscoveryForService(crawler.databaseServiceId, command.discovery);
    crawler.reconfigure(
      {
        name: command.name,
        enabled: command.enabled,
        scheduleCron: compiledSchedule?.expression,
        scheduleTimezone: compiledSchedule?.timezone,
        nextRunAt,
        timeoutSeconds: command.timeoutSeconds,
        discoveryConfig,
      },
      this.clock.now(),
    );
    if (!(await this.repository.update(crawler, expectedUpdatedAt))) {
      throw MetadataCrawlerError.concurrency();
    }
    const service = await this.requireDatabaseService(crawler.databaseServiceId);
    return this.detailsFromAggregate(crawler, service, undefined);
  }

  public async archive(id: string): Promise<void> {
    const crawler = await this.requireAggregate(id);
    const expectedUpdatedAt = crawler.updatedAt;
    crawler.archive(this.clock.now());
    if (!(await this.repository.update(crawler, expectedUpdatedAt))) {
      throw MetadataCrawlerError.concurrency();
    }
  }

  public async runNow(id: string): Promise<MetadataCrawlerRunView> {
    const crawler = await this.requireAggregate(id);
    if (crawler.isArchived) {
      throw MetadataCrawlerError.notFound();
    }
    const run = await this.unitOfWork.commit(async (events) => {
      const queuedAt = this.clock.now();
      const queued = await this.queue.enqueueManual(crawler, queuedAt);
      events.record(toMetadataCrawlerRunQueuedOutboxMessage(queued, this.ids.next(), queuedAt));
      return queued;
    });
    return toRunView(run);
  }

  public listRuns(id: string, limit?: number): Promise<readonly MetadataCrawlerRunView[]> {
    return this.reader.listRuns(id, limit);
  }

  public async getRun(runId: string): Promise<MetadataCrawlerRunView> {
    const view = await this.reader.findRunById(runId);
    if (view === undefined) {
      throw MetadataCrawlerError.notFound();
    }
    return view;
  }

  public async getRunLogs(
    runId: string,
  ): Promise<{ readonly runId: string; readonly content: string; readonly byteSize: number }> {
    const run = await this.getRun(runId);
    const content = await this.logStore.read(run.crawlerId, runId);
    if (content === undefined) {
      throw MetadataCrawlerError.notFound();
    }
    return { runId, content: content.text, byteSize: content.byteSize };
  }

  public async listAssignableDatabaseServices(): Promise<
    readonly MetadataCrawlerAssignableDatabaseServiceView[]
  > {
    const page = await this.databaseReader.listActive({
      page: 1,
      pageSize: 500,
      sortBy: 'name',
      sortDirection: 'asc',
    });
    const eligible: MetadataCrawlerAssignableDatabaseServiceView[] = [];
    for (const service of page.items) {
      if (service.verificationStatus !== VerificationStatusValue.SUCCEEDED) {
        continue;
      }
      const existing = await this.repository.findByDatabaseServiceId(service.id);
      if (existing !== undefined && !existing.isArchived) {
        continue;
      }
      try {
        const factory = this.sourceRegistry.require(service.connectorType);
        eligible.push({
          id: service.id,
          name: service.name,
          connectorType: service.connectorType,
          capabilities: factory.capabilities,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'MetadataCrawlerError') {
          continue;
        }
        throw error;
      }
    }
    return eligible;
  }

  private async requireAggregate(id: string): Promise<MetadataCrawler> {
    const crawler = await this.repository.findById(id);
    if (crawler === undefined) {
      throw MetadataCrawlerError.notFound();
    }
    return crawler;
  }

  private async normalizeDiscoveryForService(
    databaseServiceId: string,
    input: Partial<DatabaseDiscoveryConfig>,
  ): Promise<DatabaseDiscoveryConfig> {
    const service = await this.databaseReader.findActiveById(databaseServiceId);
    if (service === undefined) {
      throw MetadataCrawlerError.notFound();
    }
    const factory = this.sourceRegistry.require(service.connectorType);
    const discovery = normalizeDiscovery(input, factory.capabilities);
    validateCapabilities(discovery, factory.capabilities);
    return discovery;
  }

  private async withDetails(
    view: MetadataCrawlerView,
    snapshotSummary = EMPTY_SNAPSHOT_SUMMARY,
  ): Promise<MetadataCrawlerDetailsView> {
    const service = await this.requireDatabaseService(view.databaseServiceId);
    const lastRuns = await this.reader.listRuns(view.id, 1);
    return {
      ...view,
      schedule: this.schedule.describe(view.scheduleCron, view.scheduleTimezone),
      snapshotSummary,
      state: operationalState(view, lastRuns[0], service),
      databaseService: toDatabaseServiceView(service),
      lastRun: lastRuns[0],
    };
  }

  private async detailsFromAggregate(
    crawler: MetadataCrawler,
    service: Awaited<ReturnType<MetadataCrawlerUseCases['requireDatabaseService']>>,
    lastRun: MetadataCrawlerRunView | undefined,
  ): Promise<MetadataCrawlerDetailsView> {
    const view: MetadataCrawlerView = {
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
    return {
      ...view,
      schedule: this.schedule.describe(crawler.scheduleCron, crawler.scheduleTimezone),
      snapshotSummary: await this.snapshotSummary(crawler.databaseServiceId),
      state: operationalState(view, lastRun, service),
      databaseService: toDatabaseServiceView(service),
      lastRun,
    };
  }

  private async requireDatabaseService(id: string): Promise<{
    readonly id: string;
    readonly name: string;
    readonly connectorType: string;
  }> {
    const service = await this.databaseReader.findActiveById(id);
    if (service === undefined) {
      return { id, name: 'Archived database service', connectorType: 'UNKNOWN' };
    }
    return service;
  }

  private async snapshotSummary(databaseServiceId: string): Promise<SourceMetadataSnapshotSummary> {
    const summaries = await this.sourceMetadataReader.summariesByDatabaseServiceIds([
      databaseServiceId,
    ]);
    return summaries.get(databaseServiceId) ?? EMPTY_SNAPSHOT_SUMMARY;
  }
}

function normalizeDiscovery(
  input: Partial<DatabaseDiscoveryConfig> | undefined,
  capabilities: DatabaseMetadataCapabilities,
): DatabaseDiscoveryConfig {
  const merged: DatabaseDiscoveryConfig = {
    ...DEFAULT_DATABASE_DISCOVERY_CONFIG,
    ...(input ?? {}),
    includeMaterializedViews:
      input?.includeMaterializedViews ??
      (DEFAULT_DATABASE_DISCOVERY_CONFIG.includeMaterializedViews &&
        capabilities.materializedViews),
    includeDdl:
      input?.includeDdl ?? (DEFAULT_DATABASE_DISCOVERY_CONFIG.includeDdl && capabilities.ddl),
  };
  for (const key of [
    'databaseIncludes',
    'databaseExcludes',
    'schemaIncludes',
    'schemaExcludes',
    'relationIncludes',
    'relationExcludes',
  ] as const) {
    const values = merged[key];
    if (
      !Array.isArray(values) ||
      values.length > 100 ||
      values.some((value: unknown) => typeof value !== 'string' || value.length > 200)
    ) {
      throw MetadataCrawlerError.validation(
        `Discovery ${key} must contain at most 100 patterns of 200 characters.`,
      );
    }
  }
  return merged;
}

function validateCapabilities(
  discovery: DatabaseDiscoveryConfig,
  capabilities: DatabaseMetadataCapabilities,
): void {
  if (discovery.includeMaterializedViews && !capabilities.materializedViews) {
    throw MetadataCrawlerError.validation(
      'The selected metadata adapter does not support materialized views.',
    );
  }
  if (discovery.includeDdl && !capabilities.ddl) {
    throw MetadataCrawlerError.validation('The selected metadata adapter does not support DDL.');
  }
}

function operationalState(
  view: MetadataCrawlerView,
  lastRun: MetadataCrawlerRunView | undefined,
  service?: {
    readonly connectorType: string;
    readonly verificationStatus?: VerificationStatusValue;
  },
): MetadataCrawlerOperationalState {
  if (view.archivedAt !== undefined) return 'ARCHIVED';
  if (
    service?.connectorType === 'UNKNOWN' ||
    service?.verificationStatus !== VerificationStatusValue.SUCCEEDED
  ) {
    return 'BLOCKED';
  }
  if (!view.enabled) return 'PAUSED';
  if (lastRun?.status === 'FAILED') return 'BLOCKED';
  return 'ACTIVE';
}

function toDatabaseServiceView(service: {
  readonly id: string;
  readonly name: string;
  readonly connectorType: string;
}): MetadataCrawlerDatabaseServiceView {
  return { id: service.id, name: service.name, connectorType: service.connectorType };
}

function toRunView(run: MetadataCrawlerRun): MetadataCrawlerRunView {
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
