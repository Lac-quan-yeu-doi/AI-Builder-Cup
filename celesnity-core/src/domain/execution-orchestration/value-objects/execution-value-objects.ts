import { UniqueId } from '@domain/shared/unique-id';
import { ExecutionError } from '@domain/execution-orchestration/errors/execution.errors';
import { ExecutionMessage } from '@domain/execution-orchestration/errors/execution.messages';
import { SharedValidationMessage } from '@domain/shared/validation-messages';

const MAX_DATABASE_INTEGER = 2_147_483_647;
const SPARK_APPLICATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,255}$/u;
const SPARK_MEMORY_PATTERN = /^\d{1,9}(?:[kmgt]i?b?)?$/iu;
const BUCKET_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])?$/u;

/**
 * Lifecycle status of a Spark execution.
 *
 * A string enum, matching how every other closed vocabulary in this codebase is
 * declared. `PREPARING` is what distinguishes this from the Query Workbench
 * vocabulary: a Spark submission stages its source before it runs.
 */
export enum ExecutionStatusValue {
  QUEUED = 'QUEUED',
  PREPARING = 'PREPARING',
  SUBMITTED = 'SUBMITTED',
  RUNNING = 'RUNNING',
  CANCELLING = 'CANCELLING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMED_OUT = 'TIMED_OUT',
}

const TERMINAL_STATUSES: ReadonlySet<ExecutionStatusValue> = new Set([
  ExecutionStatusValue.SUCCEEDED,
  ExecutionStatusValue.FAILED,
  ExecutionStatusValue.CANCELLED,
  ExecutionStatusValue.TIMED_OUT,
]);

const CANCELLABLE_STATUSES: ReadonlySet<ExecutionStatusValue> = new Set([
  ExecutionStatusValue.QUEUED,
  ExecutionStatusValue.PREPARING,
  ExecutionStatusValue.SUBMITTED,
  ExecutionStatusValue.RUNNING,
]);

const ALLOWED_TRANSITIONS: Readonly<Record<ExecutionStatusValue, readonly ExecutionStatusValue[]>> =
  {
    [ExecutionStatusValue.QUEUED]: [
      ExecutionStatusValue.PREPARING,
      ExecutionStatusValue.CANCELLING,
    ],
    [ExecutionStatusValue.PREPARING]: [
      ExecutionStatusValue.SUBMITTED,
      ExecutionStatusValue.FAILED,
      ExecutionStatusValue.CANCELLING,
      ExecutionStatusValue.TIMED_OUT,
    ],
    [ExecutionStatusValue.SUBMITTED]: [
      ExecutionStatusValue.RUNNING,
      ExecutionStatusValue.SUCCEEDED,
      ExecutionStatusValue.FAILED,
      ExecutionStatusValue.CANCELLING,
      ExecutionStatusValue.TIMED_OUT,
    ],
    [ExecutionStatusValue.RUNNING]: [
      ExecutionStatusValue.SUCCEEDED,
      ExecutionStatusValue.FAILED,
      ExecutionStatusValue.CANCELLING,
      ExecutionStatusValue.TIMED_OUT,
    ],
    [ExecutionStatusValue.CANCELLING]: [
      ExecutionStatusValue.CANCELLED,
      ExecutionStatusValue.FAILED,
      ExecutionStatusValue.TIMED_OUT,
    ],
    [ExecutionStatusValue.SUCCEEDED]: [],
    [ExecutionStatusValue.FAILED]: [],
    [ExecutionStatusValue.CANCELLED]: [],
    [ExecutionStatusValue.TIMED_OUT]: [],
  };

/**
 * Narrows an arbitrary string to a member of the vocabulary, for the boundaries
 * where a status arrives as persisted text.
 */
export function isExecutionStatusValue(value: string): value is ExecutionStatusValue {
  return Object.values<string>(ExecutionStatusValue).includes(value);
}

export function isTerminalStatus(status: ExecutionStatusValue): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isCancellableStatus(status: ExecutionStatusValue): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

export function canTransition(from: ExecutionStatusValue, to: ExecutionStatusValue): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class ExecutionId extends UniqueId {
  private constructor(value: string) {
    super(value);
  }

  public static from(value: string): ExecutionId {
    try {
      return new ExecutionId(value);
    } catch {
      throw ExecutionError.validation(ExecutionMessage.invalidExecutionId);
    }
  }
}

export class SparkApplicationId {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  public static create(value: string): SparkApplicationId {
    const normalized = value.trim();
    if (!SPARK_APPLICATION_ID_PATTERN.test(normalized)) {
      throw ExecutionError.validation(ExecutionMessage.sparkApplicationIdUnexpectedFormat);
    }
    return new SparkApplicationId(normalized);
  }

  public equals(other: SparkApplicationId): boolean {
    return this.value === other.value;
  }
}

export interface ResourceProfileState {
  readonly driverMemory: string;
  readonly executorMemory: string;
  readonly executorCores: number;
  readonly maxCores: number;
}

export class ResourceProfile {
  private constructor(
    public readonly driverMemory: string,
    public readonly executorMemory: string,
    public readonly executorCores: number,
    public readonly maxCores: number,
  ) {
    Object.freeze(this);
  }

  public static create(state: ResourceProfileState): ResourceProfile {
    return new ResourceProfile(
      memory('Driver memory', state.driverMemory),
      memory('Executor memory', state.executorMemory),
      cores('Executor cores', state.executorCores),
      cores('Maximum cores', state.maxCores),
    );
  }

  public toRecord(): ResourceProfileState {
    return {
      driverMemory: this.driverMemory,
      executorMemory: this.executorMemory,
      executorCores: this.executorCores,
      maxCores: this.maxCores,
    };
  }
}

export class ExecutionFailure {
  private constructor(
    public readonly summary: string,
    public readonly exitCode: number | undefined,
  ) {
    Object.freeze(this);
  }

  public static create(summary: string, exitCode?: number): ExecutionFailure {
    const normalized = summary.trim();
    const safe = (normalized === '' ? 'The execution failed.' : normalized).slice(0, 2000);
    return new ExecutionFailure(safe, exitCode === undefined ? undefined : exitCode);
  }
}

export class LogLocation {
  private constructor(
    public readonly bucket: string,
    public readonly objectKey: string,
  ) {
    Object.freeze(this);
  }

  public static prefixFor(executionId: ExecutionId): string {
    return `executions/${executionId.value}`;
  }

  public static keyFor(executionId: ExecutionId): string {
    return `${LogLocation.prefixFor(executionId)}/logs/execution.log`;
  }

  public static forExecution(bucket: string, executionId: ExecutionId): LogLocation {
    return LogLocation.create(bucket, LogLocation.keyFor(executionId));
  }

  public static create(bucket: string, objectKey: string): LogLocation {
    const normalizedBucket = bucketName(bucket);
    const normalizedKey = objectKey.trim();
    if (
      normalizedKey === '' ||
      normalizedKey.length > 1000 ||
      normalizedKey.startsWith('/') ||
      normalizedKey.endsWith('/') ||
      normalizedKey.includes('//') ||
      normalizedKey.includes('\0')
    ) {
      throw ExecutionError.validation(ExecutionMessage.logObjectKeyInvalid);
    }
    return new LogLocation(normalizedBucket, normalizedKey);
  }

  public equals(other: LogLocation): boolean {
    return this.bucket === other.bucket && this.objectKey === other.objectKey;
  }
}

export class ExecutionTimeout {
  private constructor(public readonly milliseconds: number) {
    Object.freeze(this);
  }

  public static create(milliseconds: number): ExecutionTimeout {
    if (!Number.isInteger(milliseconds) || milliseconds < 1_000 || milliseconds > 86_400_000) {
      throw ExecutionError.validation(ExecutionMessage.timeoutOutOfRange);
    }
    return new ExecutionTimeout(milliseconds);
  }

  public hasElapsed(startedAt: Date, now: Date): boolean {
    return now.getTime() - startedAt.getTime() >= this.milliseconds;
  }
}

function memory(label: string, value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SPARK_MEMORY_PATTERN.test(normalized)) {
    throw ExecutionError.validation(ExecutionMessage.invalidSparkMemory(label));
  }
  return normalized;
}

function cores(label: string, value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DATABASE_INTEGER) {
    throw ExecutionError.validation(SharedValidationMessage.mustBePositiveInteger(label));
  }
  return value;
}

function bucketName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 63 ||
    !BUCKET_NAME_PATTERN.test(normalized) ||
    normalized.includes('..')
  ) {
    throw ExecutionError.validation(ExecutionMessage.logBucketInvalid);
  }
  return normalized;
}
