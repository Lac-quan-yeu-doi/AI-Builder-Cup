export type DependencyState = 'PENDING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';

export type JoinDecision = 'WAIT' | 'READY' | 'SKIP' | 'BLOCK';

/**
 * Runtime state is keyed by stable graph ids. Edge state is first-class so a
 * conditional branch can persist `SKIPPED` for downstream and nested joins.
 */
export interface WorkflowRunState {
  readonly nodeStates: Readonly<Record<string, DependencyState>>;
  readonly edgeStates: Readonly<Record<string, DependencyState>>;
}
