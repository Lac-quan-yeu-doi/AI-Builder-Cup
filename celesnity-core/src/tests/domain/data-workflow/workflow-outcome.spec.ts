import { resolvePipelineOutcome } from '@domain/data-workflow/services/resolve-pipeline-outcome';
import type { DependencyState } from '@domain/data-workflow/models/workflow-run-state';

describe('pipeline outcome resolution', () => {
  it.each<[DependencyState[], string]>([
    [['SUCCEEDED'], 'SUCCESS'],
    [['FAILED'], 'ERROR'],
    [['SUCCEEDED', 'FAILED'], 'ERROR'],
    [['SUCCEEDED', 'PENDING'], 'WAIT'],
    [['FAILED', 'PENDING'], 'WAIT'],
    [['SKIPPED', 'SKIPPED'], 'SKIP'],
    [['SKIPPED', 'SUCCEEDED'], 'SUCCESS'],
  ])('resolves %j as %s', (states, decision) => {
    expect(resolvePipelineOutcome(states)).toBe(decision);
  });
  it('rejects empty input', () => {
    expect(() => resolvePipelineOutcome([])).toThrow('EMPTY_OUTCOME');
  });
});
