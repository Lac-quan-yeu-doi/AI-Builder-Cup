import { secretRedactor } from '@application/shared/secret-redactor';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IDatabaseServiceRuntimeProvider } from '@application/database-service/interfaces/i-database-service-runtime-provider';
import type { IDatabaseMetadataSourceRegistry } from '@application/metadata-crawler/interfaces/i-database-metadata-source-registry';
import type { IMetadataCatalogWriter } from '@application/metadata-crawler/interfaces/i-metadata-catalog-writer';
import type { IMetadataCrawlerLogStore } from '@application/metadata-crawler/interfaces/i-metadata-crawler-log-store';
import type { IMetadataCrawlerRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-repository';
import type { IMetadataCrawlerRunQueue } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-queue';
import type { IMetadataCrawlerRunRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-repository';
import type { IMetadataCrawlerTelemetry } from '@application/metadata-crawler/interfaces/i-metadata-crawler-telemetry';
import type {
  DatabaseMetadataCrawler,
  DatabaseMetadataCrawlerResult,
} from '@application/metadata-crawler/database-metadata-crawler';
import { DEFAULT_DATABASE_DISCOVERY_CONFIG } from '@application/metadata-crawler/metadata-crawler.use-cases';
import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import type { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import {
  isTerminalRunStatus,
  type MetadataCrawlerRunCounters,
  MetadataCrawlerRunStatus,
} from '@domain/metadata-crawler/value-objects/metadata-crawler-values';

export type MetadataCrawlerDispatchOutcome =
  'CLAIMED' | 'ALREADY_RUNNING' | 'TERMINAL' | 'NOT_FOUND';

export interface MetadataCrawlerWorkerConfig {
  readonly claimBatchSize: number;
  readonly leaseMs: number;
  readonly heartbeatMs: number;
}

export class MetadataCrawlerWorkerService {
  public constructor(
    private readonly queue: IMetadataCrawlerRunQueue,
    private readonly runRepository: IMetadataCrawlerRunRepository,
    private readonly crawlerRepository: IMetadataCrawlerRepository,
    private readonly runtimeProvider: IDatabaseServiceRuntimeProvider,
    private readonly sourceRegistry: IDatabaseMetadataSourceRegistry,
    private readonly telemetry: IMetadataCrawlerTelemetry,
    private readonly logStore: IMetadataCrawlerLogStore,
    private readonly catalogWriter: IMetadataCatalogWriter,
    private readonly crawler: DatabaseMetadataCrawler,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly config: MetadataCrawlerWorkerConfig,
  ) {}

  private activeDispatches = 0;
  private readonly capacityWaiters: Array<() => void> = [];

  /**
   * Claims and processes exactly the run named by a queued event. The database
   * remains the source of truth for duplicate delivery; a second event for a
   * running or terminal row never starts another crawl.
   */
  public async dispatch(runId: string): Promise<MetadataCrawlerDispatchOutcome> {
    await this.acquireCapacity();
    try {
      const now = this.clock.now();
      const workerId = this.ids.next();
      const leaseUntil = new Date(now.getTime() + this.config.leaseMs);
      const run = await this.queue.claimById(runId, workerId, leaseUntil, now);
      if (run === undefined) {
        const status = await this.queue.findStatus(runId);
        if (status === undefined) return 'NOT_FOUND';
        if (status === MetadataCrawlerRunStatus.QUEUED) {
          throw new Error('Metadata crawler run claim raced; retry the queued event.');
        }
        return isTerminalRunStatus(status) ? 'TERMINAL' : 'ALREADY_RUNNING';
      }
      await this.process(run);
      return 'CLAIMED';
    } finally {
      this.releaseCapacity();
    }
  }

  public async process(run: MetadataCrawlerRun): Promise<void> {
    const startedAt = this.clock.now();
    const logWriter = this.logStore.openWriter(run.crawlerId, run.id);
    const abort = new AbortController();
    const heartbeatTimer = setInterval(() => {
      void this.heartbeat(run, abort).catch((error: unknown) => {
        abort.abort();
        logWriter.append(`heartbeat_failed ${secretRedactor.safeErrorMessage(error)}\n`);
      });
    }, this.config.heartbeatMs);
    try {
      const crawler = await this.crawlerRepository.findById(run.crawlerId);
      if (crawler === undefined || crawler.isArchived) throw MetadataCrawlerError.notFound();
      const profile = await this.runtimeProvider.requireVerified(crawler.databaseServiceId);
      const factory = this.sourceRegistry.require(run.connectorTypeSnapshot);
      const source = await factory.create({
        profile,
        discovery: { ...DEFAULT_DATABASE_DISCOVERY_CONFIG, ...run.safeConfigSnapshot } as never,
        deadline: new Date(startedAt.getTime() + this.config.leaseMs),
        signal: abort.signal,
        logger: {
          info: (event, context) => logWriter.append(`${event} ${JSON.stringify(context ?? {})}\n`),
          warn: (event, context) => logWriter.append(`${event} ${JSON.stringify(context ?? {})}\n`),
        },
      });
      let result: DatabaseMetadataCrawlerResult;
      try {
        result = await this.crawler.run({
          runId: run.id,
          source,
          writer: this.catalogWriter,
          discovery: { ...DEFAULT_DATABASE_DISCOVERY_CONFIG, ...run.safeConfigSnapshot } as never,
          now: startedAt,
          signal: abort.signal,
          logger: {
            info: (event, context) =>
              logWriter.append(`${event} ${JSON.stringify(context ?? {})}\n`),
            warn: (event, context) =>
              logWriter.append(`${event} ${JSON.stringify(context ?? {})}\n`),
          },
        });
      } finally {
        await source.close();
      }
      applyResult(run, result, this.clock.now());
      await this.runRepository.update(run, MetadataCrawlerRunStatus.RUNNING);
      this.telemetry.runFinished({
        connectorType: run.connectorTypeSnapshot,
        status: run.status,
        durationMs: this.clock.now().getTime() - startedAt.getTime(),
        relationCount: run.counters.relationCount,
      });
    } catch (error) {
      if (run.status === MetadataCrawlerRunStatus.RUNNING) {
        run.finishFailed(
          { category: 'INTERNAL', summary: secretRedactor.safeErrorMessage(error) },
          emptyCounters(),
          this.clock.now(),
        );
        await this.runRepository.update(run, MetadataCrawlerRunStatus.RUNNING);
      }
    } finally {
      clearInterval(heartbeatTimer);
      logWriter.append(`run_status=${run.status}\n`);
      await logWriter.finalize();
    }
  }

  private async heartbeat(run: MetadataCrawlerRun, abort: AbortController): Promise<void> {
    if (abort.signal.aborted) return;
    const now = this.clock.now();
    const alive = await this.queue.heartbeat(
      run.id,
      run.workerId ?? '',
      new Date(now.getTime() + this.config.leaseMs),
      now,
    );
    if (!alive) abort.abort();
  }

  private async acquireCapacity(): Promise<void> {
    if (this.activeDispatches < this.config.claimBatchSize) {
      this.activeDispatches += 1;
      return;
    }
    await new Promise<void>((resolve) => this.capacityWaiters.push(resolve));
    this.activeDispatches += 1;
  }

  private releaseCapacity(): void {
    this.activeDispatches -= 1;
    this.capacityWaiters.shift()?.();
  }
}

function applyResult(
  run: MetadataCrawlerRun,
  result: DatabaseMetadataCrawlerResult,
  now: Date,
): void {
  const counters = {
    ...result.discovery,
    createdCount: result.changes.created,
    updatedCount: result.changes.updated,
    unchangedCount: result.changes.unchanged,
    deletedCount: result.changes.deleted,
    warningCount: result.failedScopes,
  };
  if (result.status === 'SUCCEEDED') run.finishSucceeded(counters, now);
  else if (result.status === 'PARTIAL') run.finishPartial(counters, now);
  else
    run.finishFailed(
      { category: 'DISCOVERY', summary: 'Metadata discovery failed.' },
      counters,
      now,
    );
}

function emptyCounters(): MetadataCrawlerRunCounters {
  return {
    databaseCount: 0,
    schemaCount: 0,
    relationCount: 0,
    columnCount: 0,
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    deletedCount: 0,
    warningCount: 0,
  };
}
