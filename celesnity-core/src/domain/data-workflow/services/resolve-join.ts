import type {
  DependencyState,
  JoinDecision,
} from '@domain/data-workflow/models/workflow-run-state';

export type JoinResolutionErrorCode = 'EMPTY_JOIN';

export class JoinResolutionError extends Error {
  public constructor(public readonly code: JoinResolutionErrorCode) {
    super(code);
    this.name = JoinResolutionError.name;
  }
}

export function resolveJoin(inputs: readonly DependencyState[]): JoinDecision {
  if (inputs.length === 0) {
    throw new JoinResolutionError('EMPTY_JOIN');
  }
  if (inputs.includes('FAILED')) {
    return 'BLOCK';
  }
  if (inputs.includes('PENDING')) {
    return 'WAIT';
  }
  return inputs.every((input) => input === 'SKIPPED') ? 'SKIP' : 'READY';
}
