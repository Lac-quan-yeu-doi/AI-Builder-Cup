import type { IAgentRunStatusClient } from '@application/automation-workflow/interfaces/i-agent-run-status-client';
import type {
  AutomationWorkflowStepTerminalResult,
  IAutomationWorkflowStepPoller,
} from '@application/automation-workflow/automation-workflow-dispatcher';

export interface AgentTranscriptClient {
  fetchTranscript(
    sessionId: string,
    callerId?: string,
  ): Promise<{ finalAssistantMessage?: string } | undefined>;
}

export interface AutomationWorkflowStepPollerConfig {
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
}

const NON_TERMINAL_STATUSES = new Set(['queued', 'running']);

/** Self-scheduling poller, same setTimeout shape as `AutomationSchedulerWorker`. */
export class AutomationWorkflowStepPoller implements IAutomationWorkflowStepPoller {
  public constructor(
    private readonly statusClient: IAgentRunStatusClient,
    private readonly transcriptClient: AgentTranscriptClient,
    private readonly config: AutomationWorkflowStepPollerConfig,
  ) {}

  public watch(
    agentRunId: string,
    onTerminal: (result: AutomationWorkflowStepTerminalResult) => Promise<void>,
    callerId?: string,
  ): void {
    const deadline = Date.now() + this.config.timeoutMs;
    const tick = async (): Promise<void> => {
      const status = await this.statusClient.fetchStatus(agentRunId, callerId);
      if (status !== undefined && !NON_TERMINAL_STATUSES.has(status.status)) {
        await this.resolve(agentRunId, status, onTerminal, callerId);
        return;
      }
      if (Date.now() >= deadline) {
        await onTerminal({
          success: false,
          error: `timed out waiting for agent run ${agentRunId}`,
        });
        return;
      }
      setTimeout(() => void tick(), this.config.pollIntervalMs);
    };
    setTimeout(() => void tick(), this.config.pollIntervalMs);
  }

  private async resolve(
    agentRunId: string,
    status: { status: string; sessionId?: string; responseText?: string; error?: string },
    onTerminal: (result: AutomationWorkflowStepTerminalResult) => Promise<void>,
    callerId?: string,
  ): Promise<void> {
    if (status.status !== 'completed') {
      await onTerminal({
        success: false,
        error: status.error ?? `run ${agentRunId} ended with status ${status.status}`,
      });
      return;
    }
    const transcript =
      status.responseText === undefined && status.sessionId !== undefined
        ? await this.transcriptClient.fetchTranscript(status.sessionId, callerId)
        : undefined;
    await onTerminal({
      success: true,
      output: status.responseText ?? transcript?.finalAssistantMessage,
    });
  }
}
