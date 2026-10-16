/**
 * The order a database fills up in: connect a source, build a pipeline that
 * reads it, get tables.
 *
 * This used to be drawn permanently, as a rail of arrowed tiles above every
 * tab. It now exists only to pick the one instruction `DatabaseNextStep`
 * shows while a database is still incomplete — which is the only moment the
 * order is worth stating.
 */
export const FLOW_STAGES = ['sources', 'pipelines', 'tables'] as const;
export type FlowStage = (typeof FLOW_STAGES)[number];

export interface FlowCounts {
  readonly sources: number;
  readonly pipelines: number;
  readonly tables: number;
}

/**
 * The stage to act on, or `undefined` once the database produces something.
 *
 * Tied to the end of the flow rather than to each gap: a database that already
 * holds tables is working, and telling its owner to "connect a source" because
 * membership happens to list none would be noise. Tables can arrive from a
 * crawler with no pipeline involved, so a working database can legitimately
 * show zero of either.
 */
export function nextFlowStage(counts: FlowCounts): FlowStage | undefined {
  if (counts.tables > 0) {
    return undefined;
  }
  return FLOW_STAGES.find((stage) => counts[stage] === 0);
}
