import type {
  AutomationWorkflow,
  AutomationWorkflowRun,
  AutomationWorkflowRunSummary,
  AutomationWorkflowStep,
  AutomationWorkflowStepRun,
  AutomationWorkflowTriggerField,
} from '@/src/entities/models/automation-workflow';

export interface AutomationWorkflowStepViewModel {
  readonly id: string;
  readonly order: number;
  readonly agentId: string;
  readonly inputTemplate: Readonly<Record<string, string>>;
  readonly systemPrompt?: string;
}

export interface AutomationWorkflowViewModel {
  readonly id: string;
  readonly name: string;
  readonly status: AutomationWorkflow['status'];
  readonly triggerType: AutomationWorkflow['triggerType'];
  readonly eventTopic?: string;
  readonly scheduleCron?: string;
  readonly scheduleTimezone?: string;
  readonly createdAt: string;
  readonly triggerFields: readonly AutomationWorkflowTriggerField[];
  readonly steps: readonly AutomationWorkflowStepViewModel[];
}

export interface AutomationWorkflowStepRunViewModel {
  readonly stepId: string;
  readonly status: AutomationWorkflowStepRun['status'];
  readonly output?: string;
  readonly agentRunId?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface AutomationWorkflowRunViewModel {
  readonly runId: string;
  readonly status: AutomationWorkflowRun['status'];
  readonly triggeredBy: AutomationWorkflowRun['triggeredBy'];
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly steps: readonly AutomationWorkflowStepRunViewModel[];
}

export interface AutomationWorkflowRunSummaryViewModel {
  readonly runId: string;
  readonly status: AutomationWorkflowRunSummary['status'];
  readonly triggeredBy: AutomationWorkflowRunSummary['triggeredBy'];
  readonly startedAt: string;
  readonly finishedAt?: string;
}

function presentStep(step: AutomationWorkflowStep): AutomationWorkflowStepViewModel {
  return {
    id: step.id,
    order: step.order,
    agentId: step.agentId,
    inputTemplate: { ...step.inputTemplate },
    ...(step.systemPrompt !== undefined ? { systemPrompt: step.systemPrompt } : {}),
  };
}

export function presentAutomationWorkflow(
  workflow: AutomationWorkflow,
): AutomationWorkflowViewModel {
  return {
    id: workflow.id,
    name: workflow.name,
    status: workflow.status,
    triggerType: workflow.triggerType,
    ...(workflow.eventTopic !== undefined ? { eventTopic: workflow.eventTopic } : {}),
    ...(workflow.scheduleCron !== undefined ? { scheduleCron: workflow.scheduleCron } : {}),
    ...(workflow.scheduleTimezone !== undefined
      ? { scheduleTimezone: workflow.scheduleTimezone }
      : {}),
    createdAt: workflow.createdAt,
    triggerFields: workflow.triggerFields.map((field) => ({ ...field })),
    steps: workflow.steps.map(presentStep),
  };
}

export function presentAutomationWorkflows(
  workflows: readonly AutomationWorkflow[],
): readonly AutomationWorkflowViewModel[] {
  return workflows.map(presentAutomationWorkflow);
}

function presentStepRun(stepRun: AutomationWorkflowStepRun): AutomationWorkflowStepRunViewModel {
  return {
    stepId: stepRun.stepId,
    status: stepRun.status,
    ...(stepRun.output !== undefined ? { output: stepRun.output } : {}),
    ...(stepRun.agentRunId !== undefined ? { agentRunId: stepRun.agentRunId } : {}),
    ...(stepRun.startedAt !== undefined ? { startedAt: stepRun.startedAt } : {}),
    ...(stepRun.finishedAt !== undefined ? { finishedAt: stepRun.finishedAt } : {}),
  };
}

export function presentAutomationWorkflowRun(
  run: AutomationWorkflowRun,
): AutomationWorkflowRunViewModel {
  return {
    runId: run.runId,
    status: run.status,
    triggeredBy: run.triggeredBy,
    startedAt: run.startedAt,
    ...(run.finishedAt !== undefined ? { finishedAt: run.finishedAt } : {}),
    steps: run.steps.map(presentStepRun),
  };
}

export function presentAutomationWorkflowRunSummary(
  run: AutomationWorkflowRunSummary,
): AutomationWorkflowRunSummaryViewModel {
  return {
    runId: run.runId,
    status: run.status,
    triggeredBy: run.triggeredBy,
    startedAt: run.startedAt,
    ...(run.finishedAt !== undefined ? { finishedAt: run.finishedAt } : {}),
  };
}

export function presentAutomationWorkflowRunSummaries(
  runs: readonly AutomationWorkflowRunSummary[],
): readonly AutomationWorkflowRunSummaryViewModel[] {
  return runs.map(presentAutomationWorkflowRunSummary);
}
