import type { ResourceProfile } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import type { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';

export interface SparkSubmissionInput {
  readonly stagedSourceRef: string;
  readonly resourceProfile: ResourceProfile;
  readonly connection?: ExecutionConnectionDescriptor;
  readonly arguments: readonly string[];
  /** Opaque gateway-owned reference to an execution-scoped JSON plan file. */
  readonly runtimeConfigRef?: string;
}

export interface SparkSubmissionResult {
  readonly exitCode: number | undefined;
  readonly signal: NodeJS.Signals | undefined;
  readonly sparkApplicationId: string | undefined;
}

/**
 * A running Spark submission. Output chunks are already secret-redacted before they are
 * delivered to listeners. `terminate` requests a stop; `completed` resolves once the selected
 * runtime reports a terminal result.
 */
export interface SparkSubmission {
  onOutput(listener: (chunk: string) => void): void;
  currentSparkApplicationId(): string | undefined;
  terminate(): void;
  readonly completed: Promise<SparkSubmissionResult>;
}

export interface PythonSyntaxResult {
  readonly ok: boolean;
  readonly output: string;
}

export interface ISparkExecutionGateway {
  /**
   * Stages immutable script source in the selected execution runtime and returns an
   * opaque reference understood only by that gateway.
   */
  stageSource(executionId: string, source: Uint8Array): Promise<string>;

  /** Stages bounded, non-row runtime configuration without exposing it in process arguments. */
  stageRuntimeConfig(executionId: string, bytes: Uint8Array): Promise<string>;

  /** Validates Python syntax before Spark submission when the runtime supports it. */
  validatePythonSyntax(stagedSourceRef: string): Promise<PythonSyntaxResult>;

  /** Fails fast when the selected runtime cannot launch one executor. */
  assertCapacity?(resourceProfile: ResourceProfile): Promise<void>;

  /** Submits the staged script to the selected Spark runtime. */
  submit(input: SparkSubmissionInput): SparkSubmission;

  /** Removes per-execution staging resources. Best-effort. */
  cleanup(stagedSourceRef: string): Promise<void>;

  /** Removes the private runtime-config resource after its Spark execution completes. */
  cleanupRuntimeConfig(runtimeConfigRef: string): Promise<void>;
}
