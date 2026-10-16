import type { DependencyState } from '@domain/data-workflow/models/workflow-run-state';
import { JoinResolutionError, resolveJoin } from '@domain/data-workflow/services/resolve-join';

describe('resolveJoin', () => {
  it.each([
    [['SUCCEEDED', 'SKIPPED'], 'READY'],
    [['SKIPPED', 'SKIPPED'], 'SKIP'],
    [['SUCCEEDED', 'PENDING'], 'WAIT'],
    [['SUCCEEDED', 'FAILED'], 'BLOCK'],
  ] as const)('resolves %j as %s', (states, expected) => {
    expect(resolveJoin(states)).toBe(expected);
  });

  it('blocks when a failed input appears alongside unresolved inputs', () => {
    const states: readonly DependencyState[] = ['PENDING', 'FAILED'];

    expect(resolveJoin(states)).toBe('BLOCK');
  });

  it('waits until a nested join receives the skipped branch outcome', () => {
    const states: readonly DependencyState[] = ['SUCCEEDED', 'PENDING', 'SKIPPED'];

    expect(resolveJoin(states)).toBe('WAIT');
  });

  it('rejects an empty join', () => {
    expect(() => resolveJoin([])).toThrow(new JoinResolutionError('EMPTY_JOIN'));
  });
});
