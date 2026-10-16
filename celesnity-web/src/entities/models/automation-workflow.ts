export type AutomationWorkflowTriggerType = 'EVENT' | 'SCHEDULE';
export type AutomationWorkflowStatus = 'draft' | 'enabled';
export type AutomationWorkflowTriggerFieldType =
  'text' | 'number' | 'date' | 'datetime' | 'boolean';

/** A declared, typed trigger input the workflow's payload provides — matches `$.trigger.<name>`. */
export interface AutomationWorkflowTriggerField {
  readonly name: string;
  readonly type: AutomationWorkflowTriggerFieldType;
  readonly label?: string;
  readonly required?: boolean;
}
export type AutomationWorkflowStepRunStatus = 'queued' | 'running' | 'success' | 'failed';
export type AutomationWorkflowRunStatus = 'running' | 'success' | 'failed';
export type AutomationWorkflowRunTrigger = 'schedule' | 'event' | 'test';
import type { Document } from './document';

export interface AutomationWorkflowStep {
  readonly id: string;
  readonly order: number;
  readonly agentId: string;
  readonly inputTemplate: Readonly<Record<string, string>>;
  readonly systemPrompt?: string;
}

export interface AutomationWorkflow {
  readonly id: string;
  readonly name: string;
  readonly status: AutomationWorkflowStatus;
  readonly triggerType: AutomationWorkflowTriggerType;
  readonly eventTopic?: string;
  readonly scheduleCron?: string;
  readonly scheduleTimezone?: string;
  readonly createdAt: string;
  readonly triggerFields: readonly AutomationWorkflowTriggerField[];
  readonly steps: readonly AutomationWorkflowStep[];
}

export interface CreateAutomationWorkflowInput {
  readonly name: string;
  readonly triggerType: AutomationWorkflowTriggerType;
  readonly eventTopic?: string;
  readonly scheduleCron?: string;
  readonly scheduleTimezone?: string;
  readonly triggerFields?: readonly AutomationWorkflowTriggerField[];
}

export interface UpdateAutomationWorkflowInput {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly triggerFields?: readonly AutomationWorkflowTriggerField[];
}

export interface AddWorkflowStepInput {
  readonly agentId: string;
  readonly inputTemplate: Readonly<Record<string, string>>;
  readonly systemPrompt?: string;
}

export interface UpdateWorkflowStepInput {
  readonly agentId?: string;
  readonly inputTemplate?: Readonly<Record<string, string>>;
  readonly systemPrompt?: string;
}

export interface TestFireWorkflowInput {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly forceFailAtStep?: number;
}

export interface AutomationWorkflowStepRun {
  readonly stepId: string;
  readonly status: AutomationWorkflowStepRunStatus;
  readonly output?: string;
  /** The underlying minder-agent run this step dispatched to, for cross-referencing while debugging. */
  readonly agentRunId?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface AutomationWorkflowRun {
  readonly runId: string;
  readonly status: AutomationWorkflowRunStatus;
  readonly triggeredBy: AutomationWorkflowRunTrigger;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly steps: readonly AutomationWorkflowStepRun[];
  readonly documents?: readonly Document[];
}

/** A run history row — no step detail, unlike AutomationWorkflowRun. */
export interface AutomationWorkflowRunSummary {
  readonly runId: string;
  readonly status: AutomationWorkflowRunStatus;
  readonly triggeredBy: AutomationWorkflowRunTrigger;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

// Matches ONLY trigger inputs — `$.trigger.<name>` — never `$.step<N>.output`
// (prior-step outputs, resolved at run time). No trailing "." in the character
// class so `$.trigger.amount.` at a sentence end resolves as `amount`, not
// swallowing the sentence's own punctuation.
const TRIGGER_REF_PATTERN = /\$\.trigger\.([a-zA-Z0-9_]+)/g;

/** The typed input spec the "Run now" form renders and coerces. */
export interface TriggerInputSpec {
  readonly name: string;
  readonly type: AutomationWorkflowTriggerFieldType;
  readonly label?: string;
  readonly required: boolean;
}

/**
 * The trigger inputs a workflow needs before it can run. When the workflow
 * declares `triggerFields`, those are used verbatim (with `required` defaulting
 * to true and label preserved). Otherwise it falls back to scanning every step
 * template for `$.trigger.<name>` references only — deduplicated in
 * first-appearance order, typed `text`, required — so the "Run now" form never
 * prompts for prior-step outputs. A workflow with neither declared fields nor
 * trigger refs needs no input and returns an empty array.
 */
export function triggerInputSpecs(workflow: AutomationWorkflow): TriggerInputSpec[] {
  if (workflow.triggerFields.length > 0) {
    return workflow.triggerFields.map((field) => ({
      name: field.name,
      type: field.type,
      ...(field.label !== undefined ? { label: field.label } : {}),
      required: field.required ?? true,
    }));
  }

  const specs: TriggerInputSpec[] = [];
  const seen = new Set<string>();
  const orderedSteps = [...workflow.steps].sort((a, b) => a.order - b.order);
  for (const step of orderedSteps) {
    for (const value of Object.values(step.inputTemplate)) {
      if (typeof value !== 'string') continue;
      for (const match of value.matchAll(TRIGGER_REF_PATTERN)) {
        const name = match[1];
        if (name !== undefined && !seen.has(name)) {
          seen.add(name);
          specs.push({ name, type: 'text', required: true });
        }
      }
    }
  }
  return specs;
}
