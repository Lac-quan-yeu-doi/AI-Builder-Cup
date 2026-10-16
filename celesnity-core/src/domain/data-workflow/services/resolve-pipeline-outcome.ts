import type { DependencyState } from '@domain/data-workflow/models/workflow-run-state';

export function resolvePipelineOutcome(
  states: readonly DependencyState[],
): 'WAIT' | 'SKIP' | 'SUCCESS' | 'ERROR' {
  if (states.length === 0) throw new Error('EMPTY_OUTCOME');
  if (states.includes('PENDING')) return 'WAIT';
  if (states.every((state) => state === 'SKIPPED')) return 'SKIP';
  return states.includes('FAILED') ? 'ERROR' : 'SUCCESS';
}
