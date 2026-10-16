import type {
  AddWorkflowStepInput,
  AutomationWorkflow,
  AutomationWorkflowRun,
  AutomationWorkflowRunSummary,
  AutomationWorkflowStep,
  CreateAutomationWorkflowInput,
  TestFireWorkflowInput,
  UpdateAutomationWorkflowInput,
  UpdateWorkflowStepInput,
} from '@/src/entities/models/automation-workflow';

export interface AutomationWorkflowRepository {
  list(): Promise<readonly AutomationWorkflow[]>;
  get(id: string): Promise<AutomationWorkflow>;
  create(input: CreateAutomationWorkflowInput): Promise<AutomationWorkflow>;
  update(id: string, input: UpdateAutomationWorkflowInput): Promise<AutomationWorkflow>;
  duplicate(id: string): Promise<AutomationWorkflow>;
  remove(id: string): Promise<void>;
  addStep(id: string, input: AddWorkflowStepInput): Promise<AutomationWorkflowStep>;
  removeStep(id: string, stepId: string): Promise<void>;
  updateStep(
    id: string,
    stepId: string,
    input: UpdateWorkflowStepInput,
  ): Promise<AutomationWorkflowStep>;
  testFire(id: string, input: TestFireWorkflowInput): Promise<{ readonly runId: string }>;
  getRunStatus(id: string, runId: string): Promise<AutomationWorkflowRun>;
  listRuns(id: string): Promise<readonly AutomationWorkflowRunSummary[]>;
  retryRun(id: string, runId: string, resumeFromStep: number): Promise<void>;
}
