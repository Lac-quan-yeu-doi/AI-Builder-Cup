/** Product-facing weekday order used by calendar authoring and persistence. */
export const WORKFLOW_WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type WorkflowWeekday = (typeof WORKFLOW_WEEKDAYS)[number];

export type WatchSourceChangeType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface WatchSourceRelation {
  readonly schema: string;
  readonly table: string;
}

/** A polling cursor is selected independently for each watched table. */
export interface WatchSourceCursor {
  readonly changeColumn: string;
  readonly tieBreakerColumn: string;
}

export interface WorkflowPollingRelation extends WatchSourceRelation {
  readonly cursor: WatchSourceCursor;
}

export type WorkflowCdcRelation = WatchSourceRelation;

export interface WorkflowPollingWatchSourceTrigger {
  readonly type: 'WATCH_SOURCE';
  readonly mode: 'POLLING';
  readonly databaseServiceId: string;
  readonly everySeconds: number;
  readonly relations: readonly WorkflowPollingRelation[];
}

export interface WorkflowCdcWatchSourceTrigger {
  readonly type: 'WATCH_SOURCE';
  readonly mode: 'CDC';
  readonly databaseServiceId: string;
  readonly aggregationWindowSeconds: number;
  readonly relations: readonly WorkflowCdcRelation[];
  readonly changeTypes: readonly WatchSourceChangeType[];
}

export type WorkflowWatchSourceTrigger =
  | WorkflowPollingWatchSourceTrigger
  | WorkflowCdcWatchSourceTrigger;

/**
 * Automatic trigger settings stored on the graph's single TRIGGER node.
 *
 * Interval anchors are canonical UTC ISO-8601 instants. Keeping the anchor as
 * JSON-safe text makes the graph snapshot portable while retaining a precise,
 * fixed-rate reference point for later schedule state.
 */
export interface WorkflowCalendarTrigger {
  readonly type: 'CALENDAR';
  readonly timeOfDay: string;
  readonly weekdays: readonly WorkflowWeekday[];
  readonly timezone: string;
}

export interface WorkflowIntervalTrigger {
  readonly type: 'INTERVAL';
  readonly everySeconds: number;
  readonly anchorAt: string;
}

export type WorkflowAutomaticTrigger = WorkflowCalendarTrigger | WorkflowIntervalTrigger;
export type WorkflowTrigger = WorkflowAutomaticTrigger | WorkflowWatchSourceTrigger;
