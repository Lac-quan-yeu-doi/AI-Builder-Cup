/** Trigger kind copied from an immutable workflow-version snapshot for indexing. */
export type WorkflowScheduleTriggerKind = 'CALENDAR' | 'INTERVAL';

/**
 * Mutable operational state for one published automatic workflow trigger.
 * It deliberately does not duplicate calendar expressions or interval rates:
 * those remain pinned on the referenced immutable workflow version.
 */
export interface DataWorkflowSchedule {
  readonly id: string;
  readonly organizationId: string;
  readonly workflowId: string;
  readonly versionId: string;
  readonly actor: string;
  readonly triggerKind: WorkflowScheduleTriggerKind;
  readonly nextDueAt: Date;
  readonly intervalAnchorAt?: Date;
  readonly coalescedFromAt?: Date;
  readonly coalescedThroughAt?: Date;
  readonly coalescedCount: number;
  readonly revision: number;
  readonly enabled: boolean;
  readonly supersededAt?: Date;
  readonly leaseOwner?: string;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
