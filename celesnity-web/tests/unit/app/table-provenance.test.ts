import { describe, expect, it } from 'vitest';

import {
  isBehindPipeline,
  readTableProvenance,
} from '@/app/(workspace)/databases/[database]/_components/table-provenance';
import type { TableSnapshotViewModel } from '@/src/interface-adapters/presenters/catalog.presenter';

function snapshot(
  committedAt: string,
  summary: Record<string, string>,
  operation?: string,
): TableSnapshotViewModel {
  return {
    snapshotId: committedAt,
    committedAt,
    summary,
    ...(operation === undefined ? {} : { operation }),
  };
}

const APP = 'pipeline-ebd1d85c-35a4-4be0-9bb9-d9f4b1c8a608-v2';

describe('readTableProvenance', () => {
  it('reads the writer, the version and the row count off the newest snapshot', () => {
    const result = readTableProvenance([
      snapshot('2026-09-14T00:00:00.000Z', { 'app-name': 'pipeline-x-v1' }),
      snapshot('2026-09-15T17:41:36.217Z', { 'app-name': APP, 'total-records': '13' }, 'append'),
    ]);

    expect(result).toEqual({
      writtenAt: '2026-09-15T17:41:36.217Z',
      rows: 13,
      operation: 'append',
      pipelineId: 'ebd1d85c-35a4-4be0-9bb9-d9f4b1c8a608',
      pipelineVersion: 2,
    });
  });

  it('still reports when the table was written by something that left no app name', () => {
    // A crawler-discovered table, or a hand-run script. The commit time is the
    // fact that matters; inventing a writer would be worse than omitting one.
    const result = readTableProvenance([snapshot('2026-09-15T17:41:36.217Z', {})]);

    expect(result).toEqual({ writtenAt: '2026-09-15T17:41:36.217Z' });
  });

  it('has nothing to say about a table with no snapshots', () => {
    expect(readTableProvenance([])).toBeUndefined();
  });
});

describe('isBehindPipeline', () => {
  it('flags a table whose last write came from an older pipeline version', () => {
    // The case this exists for: two runs of v3 reported SUCCEEDED while the
    // table's newest snapshot still named v2.
    expect(isBehindPipeline({ writtenAt: 'x', pipelineVersion: 2 }, 3)).toBe(true);
  });

  it('says nothing when either version is unknown', () => {
    expect(isBehindPipeline({ writtenAt: 'x' }, 3)).toBe(false);
    expect(isBehindPipeline({ writtenAt: 'x', pipelineVersion: 2 }, undefined)).toBe(false);
    expect(isBehindPipeline(undefined, 3)).toBe(false);
  });

  it('is quiet when the table is current', () => {
    expect(isBehindPipeline({ writtenAt: 'x', pipelineVersion: 3 }, 3)).toBe(false);
  });
});
