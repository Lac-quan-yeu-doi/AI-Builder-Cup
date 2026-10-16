import type { IConnectionExecutionProfileProvider } from '@application/database-service/interfaces/i-connection-execution-profile-provider';
import { secretRedactor } from '@application/shared/secret-redactor';
import type { IExecutableWorkloadProvider } from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import type { Execution } from '@domain/execution-orchestration/aggregates/execution';
import {
  ExecutionFailure,
  ExecutionId,
  ExecutionStatusValue,
  LogLocation,
  SparkApplicationId,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { toExecutionOutboxMessage } from '@application/execution-orchestration/execution-outbox.mapper';
import type { ExecutionWorkerLogger } from '@application/execution-orchestration/execution-worker.logger';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type {
  QueuedExecutionCandidate,
  IExecutionDispatcher,
} from '@application/execution-orchestration/interfaces/i-execution-dispatcher';
import type { IExecutionRepository } from '@application/execution-orchestration/interfaces/i-execution-repository';
import type { ISparkExecutionGateway } from '@application/execution-orchestration/interfaces/i-spark-execution-gateway';
import type { SparkSubmissionSupervisor } from '@application/execution-orchestration/spark-submission.supervisor';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { ExecutionOutputFacts } from '@domain/execution-orchestration/models/execution-output-facts';

const SPARK_APPLICATION_ID_PATTERN = /(app-\d{8,}-\d+|application_\d+_\d+)/u;
const MAX_FAILURE_SUMMARY = 2_000;

export interface ExecutionWorkerConfig {
  readonly maxAttempts: number;
  readonly artifactsBucket: string;
}

/**
 * Claims queued executions, runs them, and records every state change through the
 * aggregate.
 *
 * Two things moved out of here. The submission mechanics — log streaming,
 * timeout, cancellation polling — are now {@link SparkSubmissionSupervisor}, so
 * what remains is the persistence story. And claiming itself changed: the
 * dispatcher used to transition rows to PREPARING in raw SQL, which meant
 * `Execution.startPreparing()` was never called and the transition table never
 * consulted. Claiming is now {@link ExecutionWorkerService.claim}, which loads the
 * aggregate, transitions it, and lets the status-guarded update decide the winner.
 *
 * That guard is the whole concurrency mechanism: two workers may both see the same
 * candidate, both call `startPreparing`, and both attempt the update — but the
 * `WHERE status = 'QUEUED'` clause matches for exactly one of them, and the loser
 * gets `false` and moves on. It is the same guard already used for every other
 * transition, so there is now one concurrency story instead of two.
 */
export class ExecutionWorkerService {
  public constructor(
    private readonly repository: IExecutionRepository,
    private readonly dispatcher: IExecutionDispatcher,
    private readonly gateway: ISparkExecutionGateway,
    private readonly submissions: SparkSubmissionSupervisor,
    private readonly workloads: IExecutableWorkloadProvider,
    private readonly connectionProfiles: IConnectionExecutionProfileProvider,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly contexts: AuthenticatedContextStore,
    private readonly config: ExecutionWorkerConfig,
    private readonly logger: ExecutionWorkerLogger,
  ) {}

  /**
   * Claims up to `limit` queued executions and returns the ones this worker won.
   *
   * Candidates are fetched in one read, then claimed one at a time. Losing a race
   * is expected and silent — it means another worker got there first, which is the
   * intended outcome, not a failure.
   */
  public async claim(limit: number): Promise<readonly QueuedExecutionCandidate[]> {
    const candidates = await this.dispatcher.listQueuedCandidates(limit);
    const claimed: QueuedExecutionCandidate[] = [];
    for (const candidate of candidates) {
      if (
        await this.contexts.runBackground(
          candidate.organizationId,
          () => this.claimCandidate(candidate),
          'EXECUTIONS',
        )
      ) {
        claimed.push(candidate);
      }
    }
    return claimed;
  }

  /**
   * Finalizes cancellations nobody is going to finish: executions left in
   * CANCELLING that no worker is actively processing.
   */
  public async reapCancellations(inFlightIds: readonly string[]): Promise<number> {
    const abandoned = await this.dispatcher.listAbandonedCancellations(
      this.config.maxAttempts + inFlightIds.length + 16,
      inFlightIds,
    );

    let reaped = 0;
    for (const candidate of abandoned) {
      if (
        await this.contexts.runBackground(
          candidate.organizationId,
          () => this.finalizeCancellation(ExecutionId.from(candidate.id)),
          'EXECUTIONS',
        )
      ) {
        reaped += 1;
      }
    }
    return reaped;
  }

  public async process(claimed: QueuedExecutionCandidate): Promise<void> {
    if (claimed.authorizationIdentityId !== undefined) {
      return this.contexts.runAuthorizedBackgroundActor(
        claimed.organizationId,
        claimed.authorizationIdentityId,
        () => this.processInOrganization(claimed),
      );
    }
    return this.contexts.runBackground(
      claimed.organizationId,
      () => this.processInOrganization(claimed),
      'EXECUTIONS',
    );
  }

  private async processInOrganization(claimed: QueuedExecutionCandidate): Promise<void> {
    const id = ExecutionId.from(claimed.id);
    let stagedSourceRef: string | undefined;
    let runtimeConfigRef: string | undefined;

    try {
      const execution = await this.repository.findById(id);
      if (execution === undefined || execution.status !== ExecutionStatusValue.PREPARING) {
        // Vanished, or another actor already moved it on; nothing to do.
        return;
      }

      const executable = await this.withRetry(() =>
        this.workloads.resolve(claimed.workload, {
          includeOutputFacts: execution.outputConditionPlan !== undefined,
        }),
      );
      const profile =
        claimed.connectionId === undefined
          ? undefined
          : await this.connectionProfiles.resolveExecutionProfile(claimed.connectionId);

      stagedSourceRef = await this.withRetry(() =>
        this.gateway.stageSource(id.value, executable.source),
      );
      if (execution.outputConditionPlan !== undefined) {
        const runtimeConfig = Buffer.from(JSON.stringify(execution.outputConditionPlan), 'utf8');
        runtimeConfigRef = await this.withRetry(() =>
          this.gateway.stageRuntimeConfig(id.value, runtimeConfig),
        );
      }

      const syntax = await this.gateway.validatePythonSyntax(stagedSourceRef);
      if (!syntax.ok) {
        // Rejecting before submission keeps a guaranteed-to-fail job off the
        // cluster, and the syntax output is a better failure summary than
        // anything Spark would produce.
        await this.applyTransition(execution, (target, now, eventId) => {
          target.markFailed(
            ExecutionFailure.create(
              summarize('Python syntax validation failed.', syntax.output),
              undefined,
            ),
            now,
            eventId,
          );
        });
        return;
      }

      await this.runSubmission(execution, stagedSourceRef, profile, runtimeConfigRef);
    } catch (error: unknown) {
      await this.failSafely(id, error);
    } finally {
      if (stagedSourceRef !== undefined) {
        await this.gateway.cleanup(stagedSourceRef).catch((error: unknown) => {
          this.logger.warn(`Failed to clean up execution temp file: ${safeMessage(error)}`);
        });
      }
      if (runtimeConfigRef !== undefined) {
        await this.gateway.cleanupRuntimeConfig(runtimeConfigRef).catch((error: unknown) => {
          this.logger.warn(`Failed to clean up execution runtime config: ${safeMessage(error)}`);
        });
      }
    }
  }

  private async claimCandidate(candidate: QueuedExecutionCandidate): Promise<boolean> {
    const execution = await this.repository.findById(ExecutionId.from(candidate.id));
    if (execution === undefined || execution.status !== ExecutionStatusValue.QUEUED) {
      return false;
    }
    return this.applyTransition(execution, (target, now, eventId) => {
      target.startPreparing(now, eventId);
    });
  }

  private async finalizeCancellation(id: ExecutionId): Promise<boolean> {
    const execution = await this.repository.findById(id);
    if (execution === undefined || execution.status !== ExecutionStatusValue.CANCELLING) {
      return false;
    }
    return this.applyTransition(execution, (target, now, eventId) => {
      target.markCancelled(now, eventId);
    });
  }

  private async runSubmission(
    execution: Execution,
    stagedSourceRef: string,
    profile:
      | Awaited<ReturnType<IConnectionExecutionProfileProvider['resolveExecutionProfile']>>
      | undefined,
    runtimeConfigRef?: string,
  ): Promise<void> {
    const id = execution.id;
    await this.gateway.assertCapacity?.(execution.resourceProfile);
    const submittedAt = this.clock.now();
    const advanced = await this.applyTransition(execution, (target, _now, eventId) => {
      target.markSubmitted(undefined, submittedAt, eventId);
    });
    if (!advanced) {
      // A cancellation won the race before submission, so nothing was started.
      await this.reconcileTerminal(id, undefined, undefined, false, false, undefined, undefined);
      return;
    }

    const outcome = await this.submissions.run(
      {
        executionId: id,
        stagedSourceRef,
        resourceProfile: execution.resourceProfile,
        connection: profile,
        logLocation: LogLocation.forExecution(this.config.artifactsBucket, id),
        outputConditionPlan: execution.outputConditionPlan,
        runtimeConfigRef,
      },
      {
        onStarted: async () => {
          await this.applyTransition(execution, (target, now, eventId) => {
            target.markRunning(now, eventId);
          });
        },
        isCancellationRequested: () => this.isCancellationRequested(id),
      },
    );

    await this.reconcileTerminal(
      id,
      outcome.exitCode,
      parseSparkApplicationId(outcome.sparkApplicationId),
      outcome.timedOut,
      outcome.cancelRequested,
      outcome.outputFacts,
      outcome.outputFactsError,
    );
  }

  /**
   * Decides the terminal state from how the submission ended.
   *
   * The aggregate is reloaded rather than reused: the submission may have run for
   * minutes, during which the API process could have moved the row to CANCELLING.
   * Deciding from stale in-memory state would overwrite that.
   */
  private async reconcileTerminal(
    id: ExecutionId,
    exitCode: number | undefined,
    sparkApplicationId: SparkApplicationId | undefined,
    timedOut: boolean,
    cancelRequested: boolean,
    outputFacts: ExecutionOutputFacts | undefined,
    outputFactsError: string | undefined,
  ): Promise<void> {
    const execution = await this.repository.findById(id);
    if (execution === undefined || execution.isTerminal) {
      return;
    }

    // Cancellation outranks the exit code: a terminated process usually exits
    // non-zero, and reporting that as a failure would hide the real reason.
    if (cancelRequested || execution.status === ExecutionStatusValue.CANCELLING) {
      await this.applyTransition(execution, (target, now, eventId) => {
        if (sparkApplicationId !== undefined) {
          target.attachSparkApplicationId(sparkApplicationId);
        }
        target.markCancelled(now, eventId);
      });
      return;
    }
    if (timedOut) {
      await this.applyTransition(execution, (target, now, eventId) => {
        if (sparkApplicationId !== undefined) {
          target.attachSparkApplicationId(sparkApplicationId);
        }
        target.markTimedOut(
          ExecutionFailure.create('The execution exceeded its time limit.', exitCode),
          now,
          eventId,
        );
      });
      return;
    }
    if (exitCode === 0) {
      if (execution.outputConditionPlan !== undefined && outputFacts === undefined) {
        await this.applyTransition(execution, (target, now, eventId) => {
          target.markOutputFactsUnavailable(
            outputFactsError ?? 'Committed pipeline output has no complete result facts.',
            now,
            eventId,
          );
        });
        return;
      }
      await this.applyTransition(execution, (target, now, eventId) => {
        target.markSucceeded(0, sparkApplicationId, now, eventId, outputFacts);
      });
      return;
    }
    await this.applyTransition(execution, (target, now, eventId) => {
      if (sparkApplicationId !== undefined) {
        target.attachSparkApplicationId(sparkApplicationId);
      }
      if (outputFactsError !== undefined && target.outputConditionPlan !== undefined) {
        target.recordOutputFactsError(outputFactsError);
      }
      target.markFailed(
        ExecutionFailure.create(
          exitCode === undefined
            ? 'The Spark submission did not complete.'
            : `The Spark submission exited with code ${exitCode}. See the execution log for details.`,
          exitCode,
        ),
        now,
        eventId,
      );
    });
  }

  private async failSafely(id: ExecutionId, error: unknown): Promise<void> {
    this.logger.error(`Execution ${id.value} failed: ${safeMessage(error)}`);
    try {
      const execution = await this.repository.findById(id);
      if (execution === undefined || execution.isTerminal) {
        return;
      }
      if (execution.status === ExecutionStatusValue.CANCELLING) {
        await this.applyTransition(execution, (target, now, eventId) => {
          target.markCancelled(now, eventId);
        });
        return;
      }
      await this.applyTransition(execution, (target, now, eventId) => {
        target.markFailed(ExecutionFailure.create(safeMessage(error), undefined), now, eventId);
      });
    } catch (nested: unknown) {
      // Nothing further can be done: the failure could not be recorded either.
      // Logging is the only remaining action, and it must not mask the original.
      this.logger.error(`Failed to record execution failure: ${safeMessage(nested)}`);
    }
  }

  private async isCancellationRequested(id: ExecutionId): Promise<boolean> {
    try {
      const execution = await this.repository.findById(id);
      return execution?.status === ExecutionStatusValue.CANCELLING;
    } catch (error: unknown) {
      // A failed poll must not terminate a healthy submission, so it reports
      // "not cancelled" and the next tick tries again.
      this.logger.warn(`Failed to poll cancellation state: ${safeMessage(error)}`);
      return false;
    }
  }

  /**
   * Mutates the aggregate and persists the result under the status it was loaded
   * in, staging the resulting events in the same transaction.
   *
   * Returns whether the guard held. Events are recorded only when it did — the
   * aggregate has already moved on in memory either way, but a transition that
   * did not land must not announce itself.
   */
  private async applyTransition(
    execution: Execution,
    mutate: (target: Execution, now: Date, eventId: string) => void,
  ): Promise<boolean> {
    const expectedStatus: ExecutionStatusValue = execution.status;
    mutate(execution, this.clock.now(), this.idGenerator.next());

    return this.unitOfWork.commit(async (events) => {
      const changed = await this.repository.update(execution, expectedStatus);
      if (changed) {
        events.record(...execution.pullDomainEvents().map(toExecutionOutboxMessage));
      }
      return changed;
    });
  }

  /**
   * Retries a preparation step that can fail transiently — resolving the published
   * source and staging it both cross a network. Attempts are immediate rather than
   * backed off, because the caller is a background worker whose next poll provides
   * the longer delay.
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error;
        this.logger.warn(
          `Preparation attempt ${attempt}/${this.config.maxAttempts} failed: ${safeMessage(error)}`,
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Execution preparation failed.');
  }
}

function parseSparkApplicationId(value: string | undefined): SparkApplicationId | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = SPARK_APPLICATION_ID_PATTERN.exec(value);
  const captured = match?.[1];
  if (captured === undefined) {
    return undefined;
  }
  try {
    return SparkApplicationId.create(captured);
  } catch {
    return undefined;
  }
}

function summarize(prefix: string, detail: string): string {
  const redacted = secretRedactor.redact(detail).trim();
  const tail = redacted.length > 0 ? ` ${redacted}` : '';
  return `${prefix}${tail}`.slice(0, MAX_FAILURE_SUMMARY);
}

function safeMessage(error: unknown): string {
  if (error instanceof Error) {
    return secretRedactor.redact(error.message).slice(0, MAX_FAILURE_SUMMARY);
  }
  return 'An unexpected error occurred.';
}
