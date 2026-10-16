export interface AgentRunStatus {
  readonly status: string;
  readonly sessionId?: string;
  readonly responseText?: string;
  readonly error?: string;
}

export interface IAgentRunStatusClient {
  fetchStatus(runId: string, callerId?: string): Promise<AgentRunStatus | undefined>;
}
