import { InputParseError } from '@/src/entities/errors/application-errors';
import type { AutomationWorkflowUseCases } from '@/src/application/use-cases/automation-workflow/automation-workflow.use-cases';
import type {
  AddWorkflowStepInput,
  CreateAutomationWorkflowInput,
  TestFireWorkflowInput,
  UpdateAutomationWorkflowInput,
  UpdateWorkflowStepInput,
} from '@/src/entities/models/automation-workflow';
import {
  presentAutomationWorkflow,
  presentAutomationWorkflowRun,
  presentAutomationWorkflowRunSummaries,
  presentAutomationWorkflows,
  type AutomationWorkflowRunSummaryViewModel,
  type AutomationWorkflowRunViewModel,
  type AutomationWorkflowStepViewModel,
  type AutomationWorkflowViewModel,
} from '@/src/interface-adapters/presenters/automation-workflow.presenter';

import {
  addWorkflowStepInputSchema,
  createAutomationWorkflowInputSchema,
  retryWorkflowRunInputSchema,
  testFireWorkflowInputSchema,
  updateAutomationWorkflowInputSchema,
  updateWorkflowStepInputSchema,
} from './automation-workflow.schemas';

export interface AutomationWorkflowController {
  list(): Promise<readonly AutomationWorkflowViewModel[]>;
  get(id: string): Promise<AutomationWorkflowViewModel>;
  create(input: CreateAutomationWorkflowInput): Promise<AutomationWorkflowViewModel>;
  update(id: string, input: UpdateAutomationWorkflowInput): Promise<AutomationWorkflowViewModel>;
  duplicate(id: string): Promise<AutomationWorkflowViewModel>;
  remove(id: string): Promise<void>;
  addStep(id: string, input: AddWorkflowStepInput): Promise<AutomationWorkflowStepViewModel>;
  removeStep(id: string, stepId: string): Promise<void>;
  updateStep(
    id: string,
    stepId: string,
    input: UpdateWorkflowStepInput,
  ): Promise<AutomationWorkflowStepViewModel>;
  testFire(id: string, input: TestFireWorkflowInput): Promise<{ readonly runId: string }>;
  getRunStatus(id: string, runId: string): Promise<AutomationWorkflowRunViewModel>;
  listRuns(id: string): Promise<readonly AutomationWorkflowRunSummaryViewModel[]>;
  retryRun(id: string, runId: string, input: { readonly resumeFromStep: number }): Promise<void>;
}

export const createAutomationWorkflowController = (
  useCases: AutomationWorkflowUseCases,
): AutomationWorkflowController => ({
  async list() {
    return presentAutomationWorkflows(await useCases.list());
  },

  async get(id) {
    return presentAutomationWorkflow(await useCases.get(id));
  },

  async create(input) {
    const parsed = createAutomationWorkflowInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid automation workflow input', { cause: parsed.error });
    }
    return presentAutomationWorkflow(await useCases.create(parsed.data));
  },

  async update(id, input) {
    const parsed = updateAutomationWorkflowInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid automation workflow update', { cause: parsed.error });
    }
    return presentAutomationWorkflow(await useCases.update(id, parsed.data));
  },

  async duplicate(id) {
    return presentAutomationWorkflow(await useCases.duplicate(id));
  },

  async remove(id) {
    await useCases.remove(id);
  },

  async addStep(id, input) {
    const parsed = addWorkflowStepInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid workflow step input', { cause: parsed.error });
    }
    const step = await useCases.addStep(id, parsed.data);
    return {
      id: step.id,
      order: step.order,
      agentId: step.agentId,
      inputTemplate: { ...step.inputTemplate },
      ...(step.systemPrompt !== undefined ? { systemPrompt: step.systemPrompt } : {}),
    };
  },

  async removeStep(id, stepId) {
    await useCases.removeStep(id, stepId);
  },

  async updateStep(id, stepId, input) {
    const parsed = updateWorkflowStepInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid workflow step update', { cause: parsed.error });
    }
    const step = await useCases.updateStep(id, stepId, parsed.data);
    return {
      id: step.id,
      order: step.order,
      agentId: step.agentId,
      inputTemplate: { ...step.inputTemplate },
      ...(step.systemPrompt !== undefined ? { systemPrompt: step.systemPrompt } : {}),
    };
  },

  async testFire(id, input) {
    const parsed = testFireWorkflowInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid test-fire input', { cause: parsed.error });
    }
    return useCases.testFire(id, parsed.data);
  },

  async getRunStatus(id, runId) {
    return presentAutomationWorkflowRun(await useCases.getRunStatus(id, runId));
  },

  async listRuns(id) {
    return presentAutomationWorkflowRunSummaries(await useCases.listRuns(id));
  },

  async retryRun(id, runId, input) {
    const parsed = retryWorkflowRunInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid retry input', { cause: parsed.error });
    }
    await useCases.retryRun(id, runId, parsed.data.resumeFromStep);
  },
});
