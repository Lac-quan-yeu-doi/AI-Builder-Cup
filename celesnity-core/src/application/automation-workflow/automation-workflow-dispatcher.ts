import { randomUUID } from 'node:crypto';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';

import type { AutomationWorkflow } from '@domain/automation-workflow/models/automation-workflow';
import type {
  AutomationWorkflowRun,
  AutomationWorkflowRunTrigger,
} from '@domain/automation-workflow/models/automation-workflow-run';
import type { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import type { IAutomationWorkflowRepository } from '@application/automation-workflow/interfaces/i-automation-workflow.repository';
import type { IAutomationWorkflowRunRepository } from '@application/automation-workflow/interfaces/i-automation-workflow-run.repository';
import type { IAgentWebhookClient } from '@application/automation/interfaces/i-agent-webhook-client';
import { applyInputTemplate } from '@application/automation/apply-input-template';
import { buildStepResolutionContext } from '@application/automation-workflow/build-step-resolution-context';

export interface AutomationWorkflowStepTerminalResult {
  readonly success: boolean;
  readonly output?: string;
  readonly error?: string;
}

export interface IAutomationWorkflowStepPoller {
  watch(
    agentRunId: string,
    onTerminal: (result: AutomationWorkflowStepTerminalResult) => Promise<void>,
    callerId?: string,
  ): void;
}

export interface StartWorkflowOptions {
  readonly forceFailAtStep?: number; // 1-based step position; test-fire only
}

export class AutomationWorkflowDispatcher {
  public constructor(
    private readonly workflows: IAutomationWorkflowRepository,
    private readonly runs: IAutomationWorkflowRunRepository,
    private readonly webhookClient: IAgentWebhookClient,
    private readonly poller: IAutomationWorkflowStepPoller,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public async start(
    workflow: AutomationWorkflow,
    triggerPayload: unknown,
    triggeredBy: AutomationWorkflowRunTrigger,
    opts: StartWorkflowOptions = {},
  ): Promise<AutomationWorkflowRun> {
    return this.contexts.runBackground(workflow.organizationId, async () => {
      const steps = await this.workflows.listStepsForWorkflow(workflow.id);
      const run = await this.runs.createRun(workflow.id, triggeredBy, triggerPayload, new Date());
      await this.dispatchStep(run, workflow, steps, 0, triggerPayload, opts.forceFailAtStep);
      return run;
    }, 'AUTOMATIONS');
  }

  public async retryFrom(
    run: AutomationWorkflowRun,
    workflow: AutomationWorkflow,
    resumeFromStep: number,
  ): Promise<void> {
    await this.contexts.runBackground(workflow.organizationId, async () => {
      const steps = await this.workflows.listStepsForWorkflow(workflow.id);
      await this.runs.updateRunStatus(run.id, 'running');
      await this.dispatchStep(run, workflow, steps, resumeFromStep - 1, run.triggerPayload);
    }, 'AUTOMATIONS');
  }

  private async dispatchStep(
    run: AutomationWorkflowRun,
    workflow: AutomationWorkflow,
    steps: readonly AutomationWorkflowStep[],
    stepIndex: number,
    triggerPayload: unknown,
    forceFailAtStep?: number,
  ): Promise<void> {
    if (stepIndex >= steps.length) {
      await this.runs.updateRunStatus(run.id, 'success', new Date());
      return;
    }

    const step = steps[stepIndex];
    if (step === undefined) {
      await this.runs.updateRunStatus(run.id, 'failed', new Date());
      return;
    }
    const stepNumber = stepIndex + 1; // 1-based, matches buildStepResolutionContext / forceFailAtStep
    const stepRun = await this.runs.createStepRun(run.id, step.id);

    if (forceFailAtStep === stepNumber) {
      await this.runs.updateStepRun(stepRun.id, 'failed', {
        output: 'forced failure for testing (forceFailAtStep)',
        finishedAt: new Date(),
      });
      await this.runs.updateRunStatus(run.id, 'failed', new Date());
      return;
    }

    const priorStepRuns = await this.runs.listStepRunsForRun(run.id);
    const context = buildStepResolutionContext(
      triggerPayload,
      priorStepRuns.filter((r) => r.id !== stepRun.id),
    );
    const resolved = applyInputTemplate(step.inputTemplate, context);
    const input = resolved?.message;
    if (input === undefined || input.length === 0) {
      await this.runs.updateStepRun(stepRun.id, 'failed', {
        output: 'input template did not resolve to a value',
        finishedAt: new Date(),
      });
      await this.runs.updateRunStatus(run.id, 'failed', new Date());
      return;
    }

    const agentRunId = randomUUID();
    // Core must persist the workflow-step binding before Agent can call an MCP
    // tool; otherwise the first tool may race ahead of the webhook response.
    await this.runs.updateStepRun(stepRun.id, 'running', { agentRunId });
    const result = await this.webhookClient.trigger({
      source: 'automation-workflow',
      deliveryId: `workflow:${run.id}:${step.id}:${randomUUID()}`,
      sessionKey: `workflow:${run.id}:${step.id}`,
      input,
      agentId: step.agentId,
      runId: agentRunId,
      automationContext: {
        workflowId: workflow.id,
        workflowRunId: run.id,
        workflowStepId: step.id,
        organizationId: workflow.organizationId,
      },
      ...(step.systemPrompt !== undefined ? { systemPrompt: step.systemPrompt } : {}),
    });

    if (result.outcome !== 'TRIGGERED' || result.runId !== agentRunId) {
      const output =
        result.outcome === 'TRIGGERED' ? 'triggered but no run id was returned' : result.message;
      await this.runs.updateStepRun(stepRun.id, 'failed', { output, finishedAt: new Date() });
      await this.runs.updateRunStatus(run.id, 'failed', new Date());
      return;
    }

    this.poller.watch(result.runId, async (terminal) => {
      if (!terminal.success) {
        await this.runs.updateStepRun(stepRun.id, 'failed', {
          output: terminal.error,
          finishedAt: new Date(),
        });
        await this.runs.updateRunStatus(run.id, 'failed', new Date());
        return;
      }
      await this.runs.updateStepRun(stepRun.id, 'success', {
        output: terminal.output,
        finishedAt: new Date(),
      });
      await this.dispatchStep(
        run,
        workflow,
        steps,
        stepIndex + 1,
        triggerPayload,
        forceFailAtStep,
      );
    }, result.callerId);
  }
}
