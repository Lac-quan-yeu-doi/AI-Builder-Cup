import type { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import type { IExecutionLogStore } from '@application/execution-orchestration/interfaces/i-execution-log-store';
import type { ISparkExecutionGateway } from '@application/execution-orchestration/interfaces/i-spark-execution-gateway';
import type { ExecutionWorkerLogger } from '@application/execution-orchestration/execution-worker.logger';
import type {
  ExecutionOutputConditionPlan,
  ExecutionOutputFacts,
} from '@domain/execution-orchestration/models/execution-output-facts';
import { PipelineOutputFactsEventParser } from '@application/execution-orchestration/pipeline-output-facts-event-parser';
import type {
  ExecutionId,
  LogLocation,
  ResourceProfile,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';

/** What to submit, and where its output goes. */
export interface SparkSubmissionRequest {
  readonly executionId: ExecutionId;
  readonly stagedSourceRef: string;
  readonly resourceProfile: ResourceProfile;
  readonly connection?: ExecutionConnectionDescriptor;
  readonly logLocation: LogLocation;
  readonly outputConditionPlan?: ExecutionOutputConditionPlan;
  readonly runtimeConfigRef?: string;
}

/** How a supervised submission ended. */
export interface SparkSubmissionOutcome {
  readonly exitCode: number | undefined;
  readonly sparkApplicationId: string | undefined;
  readonly timedOut: boolean;
  readonly cancelRequested: boolean;
  readonly outputFacts?: ExecutionOutputFacts;
  readonly outputFactsError?: string;
}

export interface SparkSubmissionSupervisorConfig {
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
}

/** Minimum interval for the two watchdogs, so a small poll setting cannot busy-loop. */
const MIN_LOG_FLUSH_INTERVAL_MS = 1_000;
const MIN_CANCEL_POLL_INTERVAL_MS = 500;

/**
 * Runs one Spark submission to completion and reports how it ended.
 *
 * Extracted from `ExecutionWorkerService`, where it was a single 90-line method
 * juggling four concurrent concerns: streaming stdout to object storage,
 * periodically flushing that stream, enforcing the wall-clock timeout, and
 * polling for an externally requested cancellation. Interleaved with the
 * persistence transitions, it was the hardest code in the repository to follow
 * and impossible to exercise without a database.
 *
 * The split draws the line at persistence: this class owns the child process and
 * its side effects and returns a plain description of the outcome. It performs no
 * writes and holds no repository, so deciding what the outcome *means* stays with
 * the aggregate.
 *
 * `onStarted` is a callback rather than a return value because "the query has
 * begun" is observed mid-flight, when the first output arrives, and the caller
 * needs to record RUNNING at that moment rather than at the end.
 */
export class SparkSubmissionSupervisor {
  public constructor(
    private readonly gateway: ISparkExecutionGateway,
    private readonly logStore: IExecutionLogStore,
    private readonly config: SparkSubmissionSupervisorConfig,
    private readonly logger: ExecutionWorkerLogger,
  ) {}

  /**
   * Submits and supervises until the process exits.
   *
   * Both hooks are supplied by the caller rather than resolved here, which is what
   * keeps this class free of the repository. `onStarted` fires at most once, on
   * the first byte of output, and its failure is swallowed: a submission must not
   * be abandoned because recording the RUNNING transition failed.
   * `isCancellationRequested` is polled to notice a cancellation raised
   * elsewhere — by the API process, in another transaction.
   */
  public async run(
    request: SparkSubmissionRequest,
    hooks: {
      readonly onStarted: () => Promise<void>;
      readonly isCancellationRequested: () => Promise<boolean>;
    },
  ): Promise<SparkSubmissionOutcome> {
    const logWriter = this.logStore.openWriter(request.logLocation);
    const submission = this.gateway.submit({
      stagedSourceRef: request.stagedSourceRef,
      resourceProfile: request.resourceProfile,
      connection: request.connection,
      arguments: [`--execution-id=${request.executionId.value}`],
      runtimeConfigRef: request.runtimeConfigRef,
    });

    const factsParser =
      request.outputConditionPlan === undefined
        ? undefined
        : new PipelineOutputFactsEventParser(request.executionId.value, request.outputConditionPlan);
    let outputFactsError: string | undefined;
    let outputFacts: ExecutionOutputFacts | undefined;

    let started: Promise<void> = Promise.resolve();
    let startedRecorded = false;
    submission.onOutput((chunk) => {
      logWriter.append(chunk);
      if (factsParser !== undefined && outputFactsError === undefined) {
        try {
          factsParser.consume(chunk);
        } catch {
          outputFactsError = 'Spark emitted invalid, duplicate, or mismatched output facts.';
          submission.terminate();
        }
      }
      if (!startedRecorded) {
        startedRecorded = true;
        started = hooks.onStarted().catch(() => undefined);
      }
    });

    const flushTimer = setInterval(
      () => {
        void logWriter.flush().catch((error: unknown) => {
          this.logger.warn(`Failed to flush execution log: ${describe(error)}`);
        });
      },
      Math.max(MIN_LOG_FLUSH_INTERVAL_MS, this.config.pollIntervalMs),
    );

    let timedOut = false;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      submission.terminate();
    }, this.config.timeoutMs);

    let cancelRequested = false;
    const cancelMonitor = setInterval(
      () => {
        void hooks
          .isCancellationRequested()
          .then((requested) => {
            if (requested && !cancelRequested) {
              cancelRequested = true;
              submission.terminate();
            }
          })
          .catch(() => undefined);
      },
      Math.max(MIN_CANCEL_POLL_INTERVAL_MS, this.config.pollIntervalMs),
    );

    try {
      const result = await submission.completed;
      // Let an in-flight RUNNING transition settle before returning, so the
      // caller's status-guarded terminal update sees the current status.
      await started;
      if (factsParser !== undefined && outputFactsError === undefined) {
        try {
          outputFacts = factsParser.finish();
        } catch {
          outputFactsError = 'Spark completed without a complete, valid set of output facts.';
        }
      }
      return {
        exitCode: result.exitCode,
        sparkApplicationId: submission.currentSparkApplicationId() ?? result.sparkApplicationId,
        timedOut,
        cancelRequested,
        ...(outputFacts === undefined ? {} : { outputFacts }),
        ...(outputFactsError === undefined ? {} : { outputFactsError }),
      };
    } finally {
      clearTimeout(timeoutTimer);
      clearInterval(cancelMonitor);
      clearInterval(flushTimer);
      await logWriter.finalize().catch((error: unknown) => {
        this.logger.warn(`Failed to finalize execution log: ${describe(error)}`);
        return 0;
      });
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}
