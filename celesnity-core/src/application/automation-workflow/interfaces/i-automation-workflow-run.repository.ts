import type {
  AutomationWorkflowRun,
  AutomationWorkflowRunStatus,
  AutomationWorkflowRunTrigger,
} from '@domain/automation-workflow/models/automation-workflow-run';
import type {
  AutomationWorkflowStepRun,
  AutomationWorkflowStepRunPatch,
  AutomationWorkflowStepRunStatus,
} from '@domain/automation-workflow/models/automation-workflow-step-run';
import type { Document } from '@domain/document/models/document';

export interface IAutomationWorkflowRunRepository {
  createRun(
    workflowId: string,
    triggeredBy: AutomationWorkflowRunTrigger,
    triggerPayload: unknown,
    startedAt: Date,
  ): Promise<AutomationWorkflowRun>;
  findRunById(runId: string): Promise<AutomationWorkflowRun | undefined>;
  /** Newest first. Superset of "just the latest run" — callers wanting only the latest can take index 0. */
  listRunsForWorkflow(
    workflowId: string,
    limit?: number,
  ): Promise<readonly AutomationWorkflowRun[]>;
  updateRunStatus(
    runId: string,
    status: AutomationWorkflowRunStatus,
    finishedAt?: Date,
  ): Promise<AutomationWorkflowRun>;
  createStepRun(runId: string, stepId: string): Promise<AutomationWorkflowStepRun>;
  updateStepRun(
    stepRunId: string,
    status: AutomationWorkflowStepRunStatus,
    patch?: AutomationWorkflowStepRunPatch,
  ): Promise<AutomationWorkflowStepRun>;
  listStepRunsForRun(runId: string): Promise<readonly AutomationWorkflowStepRun[]>;
  listDocumentsForRun?(runId: string): Promise<readonly Document[]>;
}
