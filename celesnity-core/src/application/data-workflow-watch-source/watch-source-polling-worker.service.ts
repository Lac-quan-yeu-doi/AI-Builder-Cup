import type { IDatabaseServiceRuntimeProvider } from '@application/database-service/interfaces/i-database-service-runtime-provider';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IWatchSourcePollingAdapterRegistry } from '@application/data-workflow-watch-source/interfaces/i-watch-source-polling-adapter-registry';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type { EstablishWatchSourceBaselineUseCase } from '@application/data-workflow-watch-source/establish-watch-source-baseline.use-case';
import type { RecordWatchSourceCaptureUseCase } from '@application/data-workflow-watch-source/record-watch-source-capture.use-case';
import { WatchSourcePollingError } from '@application/data-workflow-watch-source/watch-source-polling.errors';
import type { DataWorkflowWatchSource } from '@domain/data-workflow-watch-source/models/watch-source-persistence';
import { EMPTY_WATCH_SOURCE_CHECKPOINT } from '@application/data-workflow-watch-source/watch-source-checkpoint';

export interface WatchSourcePollingWorkerConfig {
  readonly claimBatchSize: number;
  readonly leaseMs: number;
  readonly pollLimit: number;
  readonly timeoutMs: number;
}

export interface WatchSourcePollingCycleResult {
  readonly claimed: number;
  readonly baselined: number;
  readonly captured: number;
  readonly unchanged: number;
  readonly failed: number;
}

/** Claims source leases, captures metadata-only cursor ranges, and never starts a workflow run. */
export class WatchSourcePollingWorkerService {
  public constructor(
    private readonly repository: IWatchSourceRepository,
    private readonly runtimeProvider: IDatabaseServiceRuntimeProvider,
    private readonly adapters: IWatchSourcePollingAdapterRegistry,
    private readonly contexts: AuthenticatedContextStore,
    private readonly baseline: EstablishWatchSourceBaselineUseCase,
    private readonly capture: RecordWatchSourceCaptureUseCase,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly config: WatchSourcePollingWorkerConfig,
  ) {}

  public async dispatchOnce(): Promise<WatchSourcePollingCycleResult> {
    const now = this.clock.now();
    const owner = this.ids.next();
    const sources = await this.repository.claimDueSources({
      limit: this.config.claimBatchSize,
      owner,
      now,
      leaseMs: this.config.leaseMs,
    });
    const result = { claimed: sources.length, baselined: 0, captured: 0, unchanged: 0, failed: 0 };
    for (const source of sources) {
      const token = source.leaseToken;
      if (token === undefined) {
        result.failed += 1;
        continue;
      }
      try {
        const sourceResult = await this.contexts.runBackground(
          source.organizationId,
          () => this.processSource(source),
          'EXECUTIONS',
        );
        result.baselined += sourceResult.baselined;
        result.captured += sourceResult.captured;
        result.unchanged += sourceResult.unchanged;
        result.failed += sourceResult.failed;
        if (sourceResult.failed === 0) {
          const trigger = source.trigger;
          if (trigger.type !== 'WATCH_SOURCE' || trigger.mode !== 'POLLING') {
            result.failed += 1;
          } else {
            const completedAt = this.clock.now();
            const advanced = await this.repository.completeSourceCapture({
              id: source.id,
              owner,
              token,
              completedAt,
              nextCaptureAt: advanceCadence(
                source.nextCaptureAt,
                completedAt,
                trigger.everySeconds,
              ),
            });
            if (!advanced) result.failed += 1;
          }
        }
      } catch {
        result.failed += 1;
      } finally {
        await this.repository.releaseSourceClaim(source.id, owner, token).catch(() => false);
      }
    }
    return result;
  }

  private async processSource(
    source: DataWorkflowWatchSource,
  ): Promise<
    Pick<WatchSourcePollingCycleResult, 'baselined' | 'captured' | 'unchanged' | 'failed'>
  > {
    const trigger = source.trigger;
    if (trigger.type !== 'WATCH_SOURCE' || trigger.mode !== 'POLLING') {
      throw new WatchSourcePollingError('SOURCE_QUERY_FAILED');
    }
    const adapter = this.adapters.require(source.adapterKey);
    const profile = await this.runtimeProvider.requireVerified(source.databaseServiceId);
    if (adapter.connectorType !== profile.connectorType) {
      throw new WatchSourcePollingError('SOURCE_QUERY_FAILED');
    }
    const counts = { baselined: 0, captured: 0, unchanged: 0, failed: 0 };
    for (const relation of trigger.relations) {
      try {
        const checkpoint = await this.repository.findCheckpoint(
          source.organizationId,
          source.id,
          relation,
        );
        const common = {
          profile,
          source,
          relation,
          cursor: relation.cursor,
          limit: this.config.pollLimit,
          deadline: new Date(this.clock.now().getTime() + this.config.timeoutMs),
          signal: new AbortController().signal,
        } as const;
        if (checkpoint === undefined) {
          const baselineCheckpoint = await adapter.establishBaseline({
            ...common,
            checkpoint: EMPTY_WATCH_SOURCE_CHECKPOINT,
          });
          await this.baseline.execute({
            organizationId: source.organizationId,
            watchSourceId: source.id,
            relation,
            checkpoint: baselineCheckpoint,
          });
          counts.baselined += 1;
          continue;
        }
        const observation = await adapter.poll({
          ...common,
          checkpoint: checkpoint.opaqueCheckpoint,
        });
        if (observation === undefined) {
          counts.unchanged += 1;
          continue;
        }
        await this.capture.execute({
          organizationId: source.organizationId,
          watchSourceId: source.id,
          relation,
          fromCheckpoint: observation.fromCheckpoint,
          throughCheckpoint: observation.throughCheckpoint,
          expectedCheckpointRevision: checkpoint.revision,
          fingerprint: observation.fingerprint,
          changeTypes: observation.changeTypes,
          adapterKey: adapter.adapterKey,
          adapterVersion: adapter.adapterVersion,
        });
        counts.captured += 1;
      } catch {
        counts.failed += 1;
      }
    }
    return counts;
  }
}

function advanceCadence(previousDueAt: Date, completedAt: Date, everySeconds: number): Date {
  const intervalMs = everySeconds * 1000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return completedAt;
  const elapsedMs = completedAt.getTime() - previousDueAt.getTime();
  const steps = Math.max(1, Math.floor(elapsedMs / intervalMs) + 1);
  return new Date(previousDueAt.getTime() + steps * intervalMs);
}
