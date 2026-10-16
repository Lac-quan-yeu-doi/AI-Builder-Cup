import type { AutomationWorkflowRepository } from '@/src/application/repositories/automation-workflow.repository.interface';
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

export interface AutomationWorkflowUseCases {
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

export const createAutomationWorkflowUseCases = (
  repository: AutomationWorkflowRepository,
): AutomationWorkflowUseCases => ({
  list: () => repository.list(),
  get: (id) => repository.get(id),
  create: (input) => repository.create(input),
  update: (id, input) => repository.update(id, input),
  duplicate: (id) => repository.duplicate(id),
  remove: (id) => repository.remove(id),
  addStep: (id, input) => repository.addStep(id, input),
  removeStep: (id, stepId) => repository.removeStep(id, stepId),
  updateStep: (id, stepId, input) => repository.updateStep(id, stepId, input),
  testFire: (id, input) => repository.testFire(id, input),
  getRunStatus: (id, runId) => repository.getRunStatus(id, runId),
  listRuns: (id) => repository.listRuns(id),
  retryRun: (id, runId, resumeFromStep) => repository.retryRun(id, runId, resumeFromStep),
});
