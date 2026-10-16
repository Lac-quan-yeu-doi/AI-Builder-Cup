import { describe, expect, it } from 'vitest';

import { groupExecutionsByDay, relativeDay } from '@/app/_components/execution/execution-grouping';
import type { ExecutionSummaryViewModel } from '@/src/interface-adapters/presenters/execution.presenter';

function run(id: string, finishedAt: string): ExecutionSummaryViewModel {
  return {
    id,
    workloadKind: 'PIPELINE',
    versionNumber: 1,
    status: 'succeeded',
    queuedAt: finishedAt,
    finishedAt,
    updatedAt: finishedAt,
  };
}

describe('groupExecutionsByDay', () => {
  it('buckets by local day, newest day and newest run first', () => {
    const groups = groupExecutionsByDay([
      run('older', '2026-09-14T10:00:00'),
      run('newest', '2026-09-16T11:11:00'),
      run('same-day', '2026-09-16T09:00:00'),
    ]);

    expect(groups.map((group) => group.key)).toEqual(['2026-09-16', '2026-09-14']);
    expect(groups[0]?.runs.map((entry) => entry.id)).toEqual(['newest', 'same-day']);
  });

  it('falls back to the queue time for a run that never finished', () => {
    const queued: ExecutionSummaryViewModel = {
      id: 'running',
      workloadKind: 'PIPELINE',
      versionNumber: 1,
      status: 'running',
      queuedAt: '2026-09-16T08:00:00',
      updatedAt: '2026-09-16T08:00:00',
    };

    expect(groupExecutionsByDay([queued])[0]?.key).toBe('2026-09-16');
  });
});

describe('relativeDay', () => {
  const now = new Date('2026-09-16T12:00:00');

  it('names the two days worth naming', () => {
    expect(relativeDay('2026-09-16', now)).toBe('today');
    expect(relativeDay('2026-09-15', now)).toBe('yesterday');
  });

  it('leaves anything older to a real date', () => {
    expect(relativeDay('2026-09-14', now)).toBeUndefined();
  });
});
