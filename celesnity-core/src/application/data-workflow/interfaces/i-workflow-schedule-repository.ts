import type {
  DataWorkflowSchedule,
  WorkflowScheduleTriggerKind,
} from '@domain/data-workflow/models/workflow-schedule';

export interface SynchronizeWorkflowSchedulePublication {
  readonly id: string;
  readonly organizationId: string;
  readonly workflowId: string;
  readonly versionId: string;
  /** Publishing identity revalidated before the schedule starts a background run. */
  readonly actor: string;
  readonly triggerKind?: WorkflowScheduleTriggerKind;
  readonly nextDueAt?: Date;
  readonly intervalAnchorAt?: Date;
  readonly now: Date;
}

export interface SaveWorkflowScheduleState {
  readonly enabled: boolean;
  readonly nextDueAt?: Date;
  readonly coalescedFromAt?: Date;
  readonly coalescedThroughAt?: Date;
  readonly coalescedCount?: number;
  readonly now: Date;
}

/**
 * Durable automatic-trigger state. Published snapshots remain the source of
 * trigger configuration; this record only carries mutable scheduler state.
 */
export interface IWorkflowScheduleRepository {
  findCurrent(workflowId: string): Promise<DataWorkflowSchedule | undefined>;
  synchronizePublication(input: SynchronizeWorkflowSchedulePublication): Promise<void>;
  saveState(
    id: string,
    expectedRevision: number,
    state: SaveWorkflowScheduleState,
  ): Promise<boolean>;
}
