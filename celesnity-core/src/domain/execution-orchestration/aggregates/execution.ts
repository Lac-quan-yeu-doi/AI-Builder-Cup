import type { DomainEvent } from '@domain/shared/domain-event';
import { ExecutionError } from '@domain/execution-orchestration/errors/execution.errors';
import {
  ExecutionEvent,
  ExecutionEventName,
  ExecutionFailedEvent,
  ExecutionRequestedEvent,
  ExecutionSucceededEvent,
} from '@domain/execution-orchestration/events/execution.events';
import {
  canTransition,
  ExecutionFailure,
  type ExecutionId,
  ExecutionStatusValue,
  isCancellableStatus,
  isTerminalStatus,
  type LogLocation,
  type ResourceProfile,
  type SparkApplicationId,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { ExecutionMessage } from '@domain/execution-orchestration/errors/execution.messages';
import { SharedValidationMessage } from '@domain/shared/validation-messages';
import type { ExecutionWorkload } from '@domain/execution-orchestration/models/execution-workload';
import {
  validateExecutionOutputConditionPlan,
  validateExecutionOutputFacts,
  type ExecutionOutputConditionPlan,
  type ExecutionOutputFacts,
} from '@domain/execution-orchestration/models/execution-output-facts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface ExecutionState {
  readonly id: ExecutionId;
  readonly workload?: ExecutionWorkload;
  /** @deprecated Compatibility for callers constructing a script execution state. */
  readonly scriptId?: string;
  /** @deprecated Compatibility for callers constructing a script execution state. */
  readonly scriptVersionId?: string;
  readonly connectionId?: string;
  readonly authorizationIdentityId?: string;
  readonly status: ExecutionStatusValue;
  readonly resourceProfile: ResourceProfile;
  readonly logLocation: LogLocation;
  readonly sparkApplicationId?: SparkApplicationId;
  readonly exitCode?: number;
  readonly failure?: ExecutionFailure;
  readonly outputConditionPlan?: ExecutionOutputConditionPlan;
  readonly outputFacts?: ExecutionOutputFacts;
  readonly outputFactsError?: string;
  readonly queuedAt: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly cancelledAt?: Date;
  readonly updatedAt: Date;
}

export interface RequestExecutionState {
  readonly id: ExecutionId;
  readonly workload?: ExecutionWorkload;
  /** @deprecated Compatibility for callers constructing a script execution state. */
  readonly scriptId?: string;
  /** @deprecated Compatibility for callers constructing a script execution state. */
  readonly scriptVersionId?: string;
  readonly connectionId?: string;
  readonly authorizationIdentityId?: string;
  readonly resourceProfile: ResourceProfile;
  readonly logLocation: LogLocation;
  readonly outputConditionPlan?: ExecutionOutputConditionPlan;
  readonly queuedAt: Date;
}

function uuid(label: string, value: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw ExecutionError.validation(SharedValidationMessage.mustBeValidUuid(label));
  }
  return normalized.toLowerCase();
}

function dateValue(label: string, value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw ExecutionError.validation(SharedValidationMessage.mustBeValidDate(label));
  }
  return new Date(value.getTime());
}

export class Execution {
  private readonly domainEvents: DomainEvent[] = [];
  private readonly idValue: ExecutionId;
  private readonly workloadValue: ExecutionWorkload;
  private readonly connectionIdValue: string | undefined;
  private readonly authorizationIdentityIdValue: string | undefined;
  private statusValue: ExecutionStatusValue;
  private readonly resourceProfileValue: ResourceProfile;
  private readonly logLocationValue: LogLocation;
  private sparkApplicationIdValue: SparkApplicationId | undefined;
  private exitCodeValue: number | undefined;
  private failureValue: ExecutionFailure | undefined;
  private readonly outputConditionPlanValue: ExecutionOutputConditionPlan | undefined;
  private outputFactsValue: ExecutionOutputFacts | undefined;
  private outputFactsErrorValue: string | undefined;
  private readonly queuedAtValue: Date;
  private startedAtValue: Date | undefined;
  private finishedAtValue: Date | undefined;
  private cancelledAtValue: Date | undefined;
  private updatedAtValue: Date;

  private constructor(state: ExecutionState) {
    this.idValue = state.id;
    this.workloadValue = validatedWorkload(requireWorkload(state));
    this.connectionIdValue =
      state.connectionId === undefined ? undefined : uuid('Connection ID', state.connectionId);
    this.authorizationIdentityIdValue = normalizedIdentity(state.authorizationIdentityId);
    this.statusValue = state.status;
    this.resourceProfileValue = state.resourceProfile;
    this.logLocationValue = state.logLocation;
    this.sparkApplicationIdValue = state.sparkApplicationId;
    this.exitCodeValue = state.exitCode;
    this.failureValue = state.failure;
    this.outputConditionPlanValue =
      state.outputConditionPlan === undefined
        ? undefined
        : validateExecutionOutputConditionPlan(state.outputConditionPlan);
    if (this.outputConditionPlanValue !== undefined && this.workloadValue.kind !== 'PIPELINE') {
      throw ExecutionError.validation('Output condition plans require a pipeline execution.');
    }
    this.outputFactsValue = state.outputFacts;
    this.outputFactsErrorValue =
      state.outputFactsError === undefined ? undefined : state.outputFactsError.slice(0, 500);
    if (this.outputFactsValue !== undefined) {
      if (this.outputConditionPlanValue === undefined) {
        throw ExecutionError.validation('Output facts require an output condition plan.');
      }
      this.outputFactsValue = validateExecutionOutputFacts(
        this.outputConditionPlanValue,
        this.idValue.value,
        this.outputFactsValue,
      );
    }
    this.queuedAtValue = dateValue('Queued time', state.queuedAt);
    this.startedAtValue =
      state.startedAt === undefined ? undefined : dateValue('Start time', state.startedAt);
    this.finishedAtValue =
      state.finishedAt === undefined ? undefined : dateValue('Finish time', state.finishedAt);
    this.cancelledAtValue =
      state.cancelledAt === undefined ? undefined : dateValue('Cancel time', state.cancelledAt);
    this.updatedAtValue = dateValue('Update time', state.updatedAt);

    if (this.updatedAtValue.getTime() < this.queuedAtValue.getTime()) {
      throw ExecutionError.validation(ExecutionMessage.updateBeforeQueue);
    }
  }

  public static request(state: RequestExecutionState, eventId: string): Execution {
    const queuedAt = dateValue('Queued time', state.queuedAt);
    const execution = new Execution({
      id: state.id,
      workload: requireWorkload(state),
      connectionId: state.connectionId,
      authorizationIdentityId: state.authorizationIdentityId,
      status: ExecutionStatusValue.QUEUED,
      resourceProfile: state.resourceProfile,
      logLocation: state.logLocation,
      outputConditionPlan: state.outputConditionPlan,
      queuedAt,
      updatedAt: queuedAt,
    });
    execution.domainEvents.push(
      new ExecutionRequestedEvent(
        uuid('Domain event ID', eventId),
        execution.idValue.value,
        queuedAt,
        execution.workloadValue,
        execution.connectionIdValue,
      ),
    );
    return execution;
  }

  public static rehydrate(state: ExecutionState): Execution {
    return new Execution(state);
  }

  public get id(): ExecutionId {
    return this.idValue;
  }

  public get workload(): ExecutionWorkload {
    return this.workloadValue;
  }

  public get scriptId(): string | undefined {
    return this.workloadValue.kind === 'SCRIPT' ? this.workloadValue.scriptId : undefined;
  }

  public get scriptVersionId(): string | undefined {
    return this.workloadValue.kind === 'SCRIPT' ? this.workloadValue.scriptVersionId : undefined;
  }

  public get pipelineId(): string | undefined {
    return this.workloadValue.kind === 'PIPELINE' ? this.workloadValue.pipelineId : undefined;
  }

  public get pipelineVersionId(): string | undefined {
    return this.workloadValue.kind === 'PIPELINE'
      ? this.workloadValue.pipelineVersionId
      : undefined;
  }

  public get connectionId(): string | undefined {
    return this.connectionIdValue;
  }

  public get authorizationIdentityId(): string | undefined {
    return this.authorizationIdentityIdValue;
  }

  public get status(): ExecutionStatusValue {
    return this.statusValue;
  }

  public get resourceProfile(): ResourceProfile {
    return this.resourceProfileValue;
  }

  public get logLocation(): LogLocation {
    return this.logLocationValue;
  }

  public get sparkApplicationId(): SparkApplicationId | undefined {
    return this.sparkApplicationIdValue;
  }

  public get exitCode(): number | undefined {
    return this.exitCodeValue;
  }

  public get failure(): ExecutionFailure | undefined {
    return this.failureValue;
  }

  public get outputConditionPlan(): ExecutionOutputConditionPlan | undefined {
    return this.outputConditionPlanValue;
  }

  public get outputFacts(): ExecutionOutputFacts | undefined {
    return this.outputFactsValue === undefined
      ? undefined
      : cloneOutputFacts(this.outputFactsValue);
  }

  public get outputFactsError(): string | undefined {
    return this.outputFactsErrorValue;
  }

  public get queuedAt(): Date {
    return new Date(this.queuedAtValue.getTime());
  }

  public get startedAt(): Date | undefined {
    return this.startedAtValue === undefined ? undefined : new Date(this.startedAtValue.getTime());
  }

  public get finishedAt(): Date | undefined {
    return this.finishedAtValue === undefined
      ? undefined
      : new Date(this.finishedAtValue.getTime());
  }

  public get cancelledAt(): Date | undefined {
    return this.cancelledAtValue === undefined
      ? undefined
      : new Date(this.cancelledAtValue.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this.updatedAtValue.getTime());
  }

  public get isTerminal(): boolean {
    return isTerminalStatus(this.statusValue);
  }

  public get isCancellable(): boolean {
    return isCancellableStatus(this.statusValue);
  }

  public startPreparing(at: Date, eventId: string): void {
    this.transitionTo(ExecutionStatusValue.PREPARING, at);
    this.domainEvents.push(
      new ExecutionEvent(
        uuid('Domain event ID', eventId),
        ExecutionEventName.Preparing,
        this.idValue.value,
        this.updatedAtValue,
      ),
    );
  }

  public markSubmitted(
    sparkApplicationId: SparkApplicationId | undefined,
    at: Date,
    eventId: string,
  ): void {
    this.transitionTo(ExecutionStatusValue.SUBMITTED, at);
    if (sparkApplicationId !== undefined) {
      this.sparkApplicationIdValue = sparkApplicationId;
    }
    this.domainEvents.push(
      new ExecutionEvent(
        uuid('Domain event ID', eventId),
        ExecutionEventName.Submitted,
        this.idValue.value,
        this.updatedAtValue,
      ),
    );
  }

  public markRunning(at: Date, eventId: string): void {
    this.transitionTo(ExecutionStatusValue.RUNNING, at);
    this.startedAtValue = this.updatedAtValue;
    this.domainEvents.push(
      new ExecutionEvent(
        uuid('Domain event ID', eventId),
        ExecutionEventName.Started,
        this.idValue.value,
        this.updatedAtValue,
      ),
    );
  }

  public attachSparkApplicationId(sparkApplicationId: SparkApplicationId): void {
    if (this.sparkApplicationIdValue === undefined) {
      this.sparkApplicationIdValue = sparkApplicationId;
    }
  }

  public markSucceeded(
    exitCode: number,
    sparkApplicationId: SparkApplicationId | undefined,
    at: Date,
    eventId: string,
    outputFacts?: ExecutionOutputFacts,
  ): void {
    if (this.outputConditionPlanValue !== undefined && outputFacts === undefined) {
      throw ExecutionError.validation(
        'A successful condition-aware execution requires output facts.',
      );
    }
    if (outputFacts !== undefined) {
      if (this.outputConditionPlanValue === undefined) {
        throw ExecutionError.validation('Output facts require an output condition plan.');
      }
      this.outputFactsValue = validateExecutionOutputFacts(
        this.outputConditionPlanValue,
        this.idValue.value,
        outputFacts,
      );
      this.outputFactsErrorValue = undefined;
    }
    this.transitionTo(ExecutionStatusValue.SUCCEEDED, at);
    this.exitCodeValue = validExitCode(exitCode);
    this.failureValue = undefined;
    this.finishedAtValue = this.updatedAtValue;
    if (sparkApplicationId !== undefined) {
      this.sparkApplicationIdValue = sparkApplicationId;
    }
    this.domainEvents.push(
      new ExecutionSucceededEvent(
        uuid('Domain event ID', eventId),
        this.idValue.value,
        this.updatedAtValue,
        this.exitCodeValue,
        this.sparkApplicationIdValue?.value,
      ),
    );
  }

  public markFailed(failure: ExecutionFailure, at: Date, eventId: string): void {
    this.transitionTo(ExecutionStatusValue.FAILED, at);
    this.failureValue = failure;
    this.exitCodeValue = failure.exitCode;
    this.finishedAtValue = this.updatedAtValue;
    this.domainEvents.push(
      new ExecutionFailedEvent(
        uuid('Domain event ID', eventId),
        this.idValue.value,
        this.updatedAtValue,
        failure.summary,
        failure.exitCode,
      ),
    );
  }

  public markOutputFactsUnavailable(reason: string, at: Date, eventId: string): void {
    this.recordOutputFactsError(reason);
    this.markFailed(
      ExecutionFailure.create(`AMBIGUOUS_OUTPUT_FACTS: ${this.outputFactsErrorValue ?? reason}`),
      at,
      eventId,
    );
  }

  public recordOutputFactsError(reason: string): void {
    if (this.outputConditionPlanValue === undefined) {
      throw ExecutionError.validation('Output fact failure requires an output condition plan.');
    }
    const safeReason = reason.trim().slice(0, 500);
    if (safeReason === '') {
      throw ExecutionError.validation('Output fact failure reason is required.');
    }
    this.outputFactsErrorValue = safeReason;
  }

  public requestCancellation(at: Date, eventId: string): void {
    this.transitionTo(ExecutionStatusValue.CANCELLING, at);
    this.domainEvents.push(
      new ExecutionEvent(
        uuid('Domain event ID', eventId),
        ExecutionEventName.CancellationRequested,
        this.idValue.value,
        this.updatedAtValue,
      ),
    );
  }

  public markCancelled(at: Date, eventId: string): void {
    this.transitionTo(ExecutionStatusValue.CANCELLED, at);
    this.cancelledAtValue = this.updatedAtValue;
    this.finishedAtValue = this.updatedAtValue;
    this.domainEvents.push(
      new ExecutionEvent(
        uuid('Domain event ID', eventId),
        ExecutionEventName.Cancelled,
        this.idValue.value,
        this.updatedAtValue,
      ),
    );
  }

  public markTimedOut(failure: ExecutionFailure | undefined, at: Date, eventId: string): void {
    this.transitionTo(ExecutionStatusValue.TIMED_OUT, at);
    if (failure !== undefined) {
      this.failureValue = failure;
      this.exitCodeValue = failure.exitCode;
    }
    this.finishedAtValue = this.updatedAtValue;
    this.domainEvents.push(
      new ExecutionEvent(
        uuid('Domain event ID', eventId),
        ExecutionEventName.TimedOut,
        this.idValue.value,
        this.updatedAtValue,
      ),
    );
  }

  public pullDomainEvents(): readonly DomainEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  private transitionTo(to: ExecutionStatusValue, at: Date): void {
    if (!canTransition(this.statusValue, to)) {
      throw ExecutionError.transition(this.statusValue, to);
    }
    const when = dateValue('Transition time', at);
    // The queue is claimed with the database clock while transitions use the application
    // clock; clamp forward so timestamps stay monotonic despite minor clock differences.
    this.updatedAtValue =
      when.getTime() < this.updatedAtValue.getTime() ? this.updatedAtValue : when;
    this.statusValue = to;
  }
}

function validatedWorkload(workload: ExecutionWorkload): ExecutionWorkload {
  if (!Number.isInteger(workload.versionNumber) || workload.versionNumber < 1) {
    throw ExecutionError.validation('Version number must be a positive integer.');
  }
  return workload.kind === 'SCRIPT'
    ? {
        kind: 'SCRIPT',
        scriptId: uuid('Script ID', workload.scriptId),
        scriptVersionId: uuid('Script version ID', workload.scriptVersionId),
        versionNumber: workload.versionNumber,
      }
    : {
        kind: 'PIPELINE',
        pipelineId: uuid('Pipeline ID', workload.pipelineId),
        pipelineVersionId: uuid('Pipeline version ID', workload.pipelineVersionId),
        versionNumber: workload.versionNumber,
      };
}

function requireWorkload(
  state: Pick<ExecutionState, 'workload' | 'scriptId' | 'scriptVersionId'>,
): ExecutionWorkload {
  if (state.workload !== undefined) return state.workload;
  if (state.scriptId !== undefined && state.scriptVersionId !== undefined) {
    return {
      kind: 'SCRIPT',
      scriptId: state.scriptId,
      scriptVersionId: state.scriptVersionId,
      versionNumber: 1,
    };
  }
  throw ExecutionError.validation('Execution workload is required.');
}

function validExitCode(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw ExecutionError.validation(ExecutionMessage.exitCodeOutOfRange);
  }
  return value;
}

function normalizedIdentity(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 320) {
    throw ExecutionError.validation('Authorization identity must contain 1 to 320 characters.');
  }
  return normalized;
}

function cloneOutputFacts(facts: ExecutionOutputFacts): ExecutionOutputFacts {
  return {
    executionId: facts.executionId,
    targets: facts.targets.map((target) => ({
      targetNodeId: target.targetNodeId,
      totalRows: target.totalRows,
      matchesByBranchId: { ...target.matchesByBranchId },
    })),
  };
}
