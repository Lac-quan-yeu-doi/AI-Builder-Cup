import type { WorkflowAutomaticTrigger } from '@domain/data-workflow/models/workflow-trigger';

/** Calculates a future automatic trigger occurrence; implementations own cron parsing. */
export interface IWorkflowTriggerSchedule {
  next(trigger: WorkflowAutomaticTrigger, after: Date): Date;
}
