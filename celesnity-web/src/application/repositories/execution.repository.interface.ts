import type {
  ExecutionDetail,
  ExecutionLog,
  ExecutionSummary,
  RerunOutcome,
} from '@/src/entities/models/execution';

export interface ExecutionRepository {
  list(): Promise<readonly ExecutionSummary[]>;
  get(id: string): Promise<ExecutionDetail>;
  cancel(id: string): Promise<ExecutionDetail>;
  /**
   * Resolves the secret-redacted log for an execution. Returns `undefined` when
   * the log has not been produced yet so callers can render a waiting state
   * instead of surfacing an error.
   */
  fetchLogs(id: string): Promise<ExecutionLog | undefined>;
  /**
   * Re-submits the same immutable script version. The version number is resolved
   * from the referenced version identity; missing versions and conflicting
   * lifecycle states are reported through the returned outcome.
   */
  rerun(scriptId: string, scriptVersionId: string): Promise<RerunOutcome>;
}
