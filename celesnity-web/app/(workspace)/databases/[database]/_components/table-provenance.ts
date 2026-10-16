import type { TableSnapshotViewModel } from '@/src/interface-adapters/presenters/catalog.presenter';

/**
 * What wrote a table, read off the table itself.
 *
 * The Spark runtime stamps every Iceberg commit with
 * `app-name = pipeline-{id}-v{version}`, and the snapshot already carries the
 * row count and the commit time. So the chain table -> pipeline -> version
 * costs nothing: it is in the snapshot list the Tables tab already fetches.
 *
 * This matters because "the run succeeded" and "the table changed" are not the
 * same fact. A run can finish clean without advancing the catalog pointer, and
 * until the table says who wrote it and when, nothing on screen can tell.
 */
export interface TableProvenance {
  readonly writtenAt: string;
  readonly rows?: number;
  readonly pipelineId?: string;
  readonly pipelineVersion?: number;
  readonly operation?: string;
}

/** `pipeline-ebd1d85c-35a4-4be0-9bb9-d9f4b1c8a608-v2` -> id + 2. */
const APP_NAME = /^pipeline-(?<id>[0-9a-fA-F-]{36})-v(?<version>\d+)$/u;

export function readTableProvenance(
  snapshots: readonly TableSnapshotViewModel[],
): TableProvenance | undefined {
  // Newest first. Core returns them in commit order, but the order is Trino's
  // to change and a provenance line that silently shows the first write would
  // be worse than none.
  const latest = [...snapshots].sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0];
  if (latest === undefined) {
    return undefined;
  }

  const written = APP_NAME.exec(latest.summary['app-name'] ?? '');
  const rows = Number.parseInt(latest.summary['total-records'] ?? '', 10);

  return {
    writtenAt: latest.committedAt,
    ...(Number.isNaN(rows) ? {} : { rows }),
    ...(latest.operation === undefined ? {} : { operation: latest.operation }),
    ...(written?.groups === undefined
      ? {}
      : {
          pipelineId: written.groups.id,
          pipelineVersion: Number.parseInt(written.groups.version ?? '', 10),
        }),
  };
}

/**
 * The pipeline has moved on and the table has not.
 *
 * Stated only when both versions are known. A table written by something other
 * than a pipeline — a crawler, a hand-run script — has no version to be behind,
 * and guessing one would invent a problem.
 */
export function isBehindPipeline(
  provenance: TableProvenance | undefined,
  pipelineVersion: number | undefined,
): boolean {
  if (provenance?.pipelineVersion === undefined || pipelineVersion === undefined) {
    return false;
  }
  return provenance.pipelineVersion < pipelineVersion;
}
