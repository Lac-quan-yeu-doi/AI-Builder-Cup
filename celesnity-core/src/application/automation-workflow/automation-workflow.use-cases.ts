import type {
  AutomationWorkflow,
  AutomationWorkflowStatus,
  AutomationWorkflowTriggerType,
  AutomationWorkflowTriggerField,
} from '@domain/automation-workflow/models/automation-workflow';
import type { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import type { AutomationWorkflowRun } from '@domain/automation-workflow/models/automation-workflow-run';
import type { AutomationWorkflowStepRun } from '@domain/automation-workflow/models/automation-workflow-step-run';
import type { Document } from '@domain/document/models/document';
import type {
  CreateAutomationWorkflowInput,
  IAutomationWorkflowRepository,
} from '@application/automation-workflow/interfaces/i-automation-workflow.repository';
import type { IAutomationWorkflowRunRepository } from '@application/automation-workflow/interfaces/i-automation-workflow-run.repository';
import type { AutomationWorkflowDispatcher } from '@application/automation-workflow/automation-workflow-dispatcher';
import type {
  AvailableAgent,
  IAgentWebhookClient,
} from '@application/automation/interfaces/i-agent-webhook-client';
import type { IAgentAutomationSchedule } from '@application/automation/interfaces/i-agent-automation-schedule';
import { validateTriggerFields } from '@application/automation-workflow/validate-trigger-fields';

const NON_STEP_AGENT_NAMES = new Set(['automation-workflow-editor', 'chart-encoding-inference']);

export class AutomationWorkflowUseCases {
  public constructor(
    private readonly workflows: IAutomationWorkflowRepository,
    private readonly runs: IAutomationWorkflowRunRepository,
    private readonly dispatcher: AutomationWorkflowDispatcher,
    private readonly webhookClient: IAgentWebhookClient,
    private readonly schedule: IAgentAutomationSchedule,
  ) {}

  public async createWorkflow(input: CreateAutomationWorkflowInput): Promise<AutomationWorkflow> {
    return this.workflows.create({
      ...input,
      triggerFields: validateTriggerFields(input.triggerFields),
    });
  }

  public listWorkflows(organizationId: string): Promise<readonly AutomationWorkflow[]> {
    return this.workflows.listForOrganization(organizationId);
  }

  public async getWorkflow(
    id: string,
  ): Promise<
    { workflow: AutomationWorkflow; steps: readonly AutomationWorkflowStep[] } | undefined
  > {
    const workflow = await this.workflows.findById(id);
    if (workflow === undefined) return undefined;
    const steps = await this.workflows.listStepsForWorkflow(id);
    return { workflow, steps };
  }

  public async listAvailableAgents(): Promise<readonly AvailableAgent[]> {
    const agents = await this.webhookClient.listAgents();
    return agents.filter((agent) => !NON_STEP_AGENT_NAMES.has(agent.name));
  }

  public async addStep(
    workflowId: string,
    agentId: string,
    inputTemplate: Readonly<Record<string, string>>,
    systemPrompt?: string,
  ): Promise<AutomationWorkflowStep> {
    return this.workflows.addStep(workflowId, agentId, inputTemplate, systemPrompt);
  }

  public listSteps(workflowId: string): Promise<readonly AutomationWorkflowStep[]> {
    return this.workflows.listStepsForWorkflow(workflowId);
  }

  public removeStep(stepId: string): Promise<void> {
    return this.workflows.removeStep(stepId);
  }

  public updateStep(
    stepId: string,
    patch: {
      agentId?: string;
      inputTemplate?: Readonly<Record<string, string>>;
      systemPrompt?: string;
    },
  ): Promise<AutomationWorkflowStep> {
    return this.workflows.updateStep(stepId, patch);
  }

  public async setEnabled(id: string, enabled: boolean): Promise<AutomationWorkflow> {
    const status: AutomationWorkflowStatus = enabled ? 'enabled' : 'draft';
    const updated = await this.workflows.setStatus(id, status);
    await this.refreshNextRun(updated, enabled);
    return updated;
  }

  /**
   * Keeps `nextRunAt` in step with a workflow's schedule: when an enabled
   * SCHEDULE workflow has a cron + timezone, compute the next fire time;
   * otherwise clear it so the claim query (`scheduleDue`) can't pick up a
   * disabled or non-schedule workflow. Called after any status/trigger change.
   */
  private async refreshNextRun(
    workflow: AutomationWorkflow,
    enabled: boolean,
    at: Date = new Date(),
  ): Promise<void> {
    const cron = workflow.scheduleCron;
    const timezone = workflow.scheduleTimezone;
    // Enabling a non-SCHEDULE workflow never has a nextRunAt to manage, so
    // leave the column untouched. Disabling anything (or an incomplete
    // SCHEDULE config) clears it so `scheduleDue` can't claim it; a fully
    // configured, enabled SCHEDULE workflow gets its next fire time.
    if (enabled && workflow.triggerType !== 'SCHEDULE') {
      return;
    }
    if (!enabled || cron === undefined || timezone === undefined) {
      await this.workflows.advanceNextRun(workflow.id, null);
      return;
    }
    const next = this.schedule.next(cron, timezone, at);
    await this.workflows.advanceNextRun(workflow.id, next);
  }

  public renameWorkflow(id: string, name: string): Promise<AutomationWorkflow> {
    return this.workflows.rename(id, name);
  }

  public async updateTrigger(
    id: string,
    patch: {
      triggerType?: AutomationWorkflowTriggerType;
      eventTopic?: string;
      scheduleCron?: string;
      scheduleTimezone?: string;
      triggerFields?: readonly AutomationWorkflowTriggerField[];
    },
  ): Promise<AutomationWorkflow> {
    const normalized =
      patch.triggerFields !== undefined
        ? { ...patch, triggerFields: validateTriggerFields(patch.triggerFields) }
        : patch;
    return this.workflows.updateTrigger(id, normalized);
  }

  public deleteWorkflow(id: string): Promise<void> {
    return this.workflows.delete(id);
  }

  /** Copies trigger config and steps into a brand-new draft workflow with no run history — never the source's status or runs. */
  public async duplicateWorkflow(id: string, createdBy: string): Promise<AutomationWorkflow> {
    const source = await this.workflows.findById(id);
    if (source === undefined) {
      throw new Error(`Automation workflow ${id} not found`);
    }
    const steps = await this.workflows.listStepsForWorkflow(id);
    const copy = await this.workflows.create({
      organizationId: source.organizationId,
      name: `${source.name} (copy)`,
      triggerType: source.triggerType,
      eventTopic: source.eventTopic,
      scheduleCron: source.scheduleCron,
      scheduleTimezone: source.scheduleTimezone,
      createdBy,
    });
    for (const step of steps) {
      await this.workflows.addStep(copy.id, step.agentId, step.inputTemplate, step.systemPrompt);
    }
    return copy;
  }

  public async dispatchWorkflowsForEvent(
    organizationId: string,
    eventTopic: string,
    payload: unknown,
  ): Promise<void> {
    const matches = await this.workflows.findEnabledByTopic(organizationId, eventTopic);
    for (const workflow of matches) {
      await this.dispatcher.start(workflow, payload, 'event', {});
    }
  }

  /** Claims up to `limit` enabled SCHEDULE workflows whose nextRunAt is due. */
  public claimDueSchedules(limit: number, now: Date): Promise<readonly AutomationWorkflow[]> {
    return this.workflows.scheduleDue(limit, now);
  }

  /**
   * Dispatches one already-claimed SCHEDULE workflow with a synthetic
   * `{ firedAt }` payload, then advances its `nextRunAt` to the next cron
   * occurrence so the claim query won't re-pick it until then. Mirrors the
   * legacy `AutomationUseCases.dispatchScheduledAutomation`.
   */
  public async dispatchScheduledWorkflow(
    workflow: AutomationWorkflow,
    now: Date,
  ): Promise<AutomationWorkflowRun> {
    const run = await this.dispatcher.start(
      workflow,
      { firedAt: now.toISOString() },
      'schedule',
      {},
    );
    await this.refreshNextRun(workflow, true, now);
    return run;
  }

  public async testFireWorkflow(
    workflowId: string,
    samplePayload: unknown,
    forceFailAtStep?: number,
  ): Promise<AutomationWorkflowRun> {
    const workflow = await this.workflows.findById(workflowId);
    if (workflow === undefined) {
      throw new Error(`Automation workflow ${workflowId} not found`);
    }
    return this.dispatcher.start(
      workflow,
      samplePayload,
      'test',
      forceFailAtStep !== undefined ? { forceFailAtStep } : {},
    );
  }

  public async getRunStatus(runId: string): Promise<
    | {
        run: AutomationWorkflowRun;
        stepRuns: readonly AutomationWorkflowStepRun[];
        documents?: readonly Document[];
      }
    | undefined
  > {
    const run = await this.runs.findRunById(runId);
    if (run === undefined) return undefined;
    const stepRuns = await this.runs.listStepRunsForRun(runId);
    const documents =
      typeof this.runs.listDocumentsForRun === 'function'
        ? await this.runs.listDocumentsForRun(runId)
        : [];
    return { run, stepRuns, documents };
  }

  /** Newest first — the workflow's own detail screen doesn't know a run's id when it started elsewhere (chat, a schedule firing), so it lists rather than asks for one. */
  public listRuns(workflowId: string, limit?: number): Promise<readonly AutomationWorkflowRun[]> {
    return this.runs.listRunsForWorkflow(workflowId, limit);
  }

  public async retryWorkflowRun(
    runId: string,
    workflowId: string,
    resumeFromStep: number,
  ): Promise<void> {
    const run = await this.runs.findRunById(runId);
    if (run === undefined) {
      throw new Error(`Automation workflow run ${runId} not found`);
    }
    const workflow = await this.workflows.findById(workflowId);
    if (workflow === undefined) {
      throw new Error(`Automation workflow ${workflowId} not found`);
    }
    if (run.workflowId !== workflow.id) {
      throw new Error('Automation workflow run does not belong to this workflow');
    }
    await this.dispatcher.retryFrom(run, workflow, resumeFromStep);
  }
}
