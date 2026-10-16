export interface AgentWebhookTriggerRequest {
  readonly source: string;
  readonly deliveryId: string;
  readonly sessionKey: string;
  /** The turn's input text — minder-runtime's `TurnBody.input` is a plain string, not an object. */
  readonly input: string;
  /**
   * Which `agents/*.yaml` manifest should run this turn — minder-runtime
   * resolves it through the same fallback chain `/turns` uses, applying
   * that manifest's own system prompt and tool scope instead of the bare
   * built-in autonomous prompt and every agent's tools combined.
   */
  readonly agentId: string;
  /** Pre-persisted workflow step run identity, chosen by Core before Agent admission. */
  readonly runId?: string;
  readonly automationContext?: {
    readonly workflowId: string;
    readonly workflowRunId: string;
    readonly workflowStepId: string;
    readonly organizationId: string;
  };
  /**
   * Optional per-turn system-prompt override. When set, minder-runtime's
   * TurnBody applies it via RunOverrides in place of the resolved agent
   * manifest's own system prompt — letting one agent run a step under a
   * different persona. Sent on the wire as snake_case `system_prompt`;
   * omitted entirely when undefined so the agent's default is used.
   */
  readonly systemPrompt?: string;
}

export type AgentWebhookTriggerResult =
  | {
      readonly outcome: 'TRIGGERED';
      readonly runId?: string;
      /** Identity used to scope the agent run and subsequent status reads. */
      readonly callerId?: string;
    }
  | { readonly outcome: 'UNKNOWN_AGENT'; readonly message: string }
  | { readonly outcome: 'UNREACHABLE'; readonly message: string };

export interface AvailableAgent {
  readonly name: string;
  readonly systemPrompt?: string;
}

export interface IAgentWebhookClient {
  trigger(request: AgentWebhookTriggerRequest): Promise<AgentWebhookTriggerResult>;
  listAgents(): Promise<readonly AvailableAgent[]>;
}
