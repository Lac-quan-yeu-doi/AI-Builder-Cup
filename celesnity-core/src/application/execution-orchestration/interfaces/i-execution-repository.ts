import type { Execution } from '@domain/execution-orchestration/aggregates/execution';
import type {
  ExecutionId,
  ExecutionStatusValue,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';

export interface IExecutionRepository {
  /**
   * Persists a newly requested execution. Must run inside a unit of work so the
   * execution row and its `ExecutionRequested` message commit atomically.
   */
  create(execution: Execution): Promise<void>;

  /**
   * Applies an execution state transition, guarded by the status the aggregate was
   * loaded in. Returns `false` when no row matched the expected status, which
   * signals a concurrent transition — a cancellation racing with completion, or
   * another worker claiming the same queued execution.
   *
   * That return value is load-bearing for queue claiming: the guard is what makes
   * `QUEUED -> PREPARING` exclusive without a row lock, so exactly one worker can
   * win a given execution.
   */
  update(execution: Execution, expectedStatus: ExecutionStatusValue): Promise<boolean>;

  findById(id: ExecutionId): Promise<Execution | undefined>;
}
