export interface AutomationWorkflowStepProps {
  readonly id: string;
  readonly workflowId: string;
  readonly order: number;
  readonly agentId: string;
  readonly inputTemplate: Readonly<Record<string, string>>;
  /** Optional per-step system-prompt override — lets one agent play a different persona per step. Omitted means the agent's own default system prompt is used. */
  readonly systemPrompt?: string;
}

export class AutomationWorkflowStep {
  private constructor(
    public readonly id: string,
    public readonly workflowId: string,
    public readonly order: number,
    public readonly agentId: string,
    public readonly inputTemplate: Readonly<Record<string, string>>,
    public readonly systemPrompt?: string,
  ) {
    Object.freeze(this);
  }

  public static create(props: AutomationWorkflowStepProps): AutomationWorkflowStep {
    return new AutomationWorkflowStep(
      props.id,
      props.workflowId,
      props.order,
      props.agentId,
      props.inputTemplate,
      props.systemPrompt,
    );
  }
}
