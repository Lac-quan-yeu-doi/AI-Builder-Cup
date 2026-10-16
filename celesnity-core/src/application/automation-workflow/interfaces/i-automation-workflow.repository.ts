import type {
  AutomationWorkflow,
  AutomationWorkflowStatus,
  AutomationWorkflowTriggerType,
  AutomationWorkflowTriggerField,
} from '@domain/automation-workflow/models/automation-workflow';
import type { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';

export interface CreateAutomationWorkflowInput {
  readonly organizationId: string;
  readonly name: string;
  readonly triggerType: AutomationWorkflowTriggerType;
  readonly eventTopic?: string;
  readonly scheduleCron?: string;
  readonly scheduleTimezone?: string;
  readonly nextRunAt?: Date;
  readonly triggerFields?: readonly AutomationWorkflowTriggerField[];
  readonly createdBy: string;
}

export interface IAutomationWorkflowRepository {
  create(input: CreateAutomationWorkflowInput): Promise<AutomationWorkflow>;
  listForOrganization(organizationId: string): Promise<readonly AutomationWorkflow[]>;
  findById(id: string): Promise<AutomationWorkflow | undefined>;
  setStatus(id: string, status: AutomationWorkflowStatus): Promise<AutomationWorkflow>;
  rename(id: string, name: string): Promise<AutomationWorkflow>;
  updateTrigger(
    id: string,
    patch: {
      triggerType?: AutomationWorkflowTriggerType;
      eventTopic?: string;
      scheduleCron?: string;
      scheduleTimezone?: string;
      triggerFields?: readonly AutomationWorkflowTriggerField[];
    },
  ): Promise<AutomationWorkflow>;
  delete(id: string): Promise<void>;
  findEnabledByTopic(
    organizationId: string,
    eventTopic: string,
  ): Promise<readonly AutomationWorkflow[]>;
  scheduleDue(limit: number, now: Date): Promise<readonly AutomationWorkflow[]>;
  advanceNextRun(id: string, nextRunAt: Date | null): Promise<void>;
  listStepsForWorkflow(workflowId: string): Promise<readonly AutomationWorkflowStep[]>;
  addStep(
    workflowId: string,
    agentId: string,
    inputTemplate: Readonly<Record<string, string>>,
    systemPrompt?: string,
  ): Promise<AutomationWorkflowStep>;
  removeStep(stepId: string): Promise<void>;
  updateStep(
    stepId: string,
    patch: {
      agentId?: string;
      inputTemplate?: Readonly<Record<string, string>>;
      systemPrompt?: string;
    },
  ): Promise<AutomationWorkflowStep>;
}
