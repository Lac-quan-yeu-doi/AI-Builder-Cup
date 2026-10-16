export type AutomationWorkflowStepRunStatus = 'queued' | 'running' | 'success' | 'failed';

export interface AutomationWorkflowStepRunProps {
  readonly id: string;
  readonly runId: string;
  readonly stepId: string;
  readonly agentRunId?: string;
  readonly status: AutomationWorkflowStepRunStatus;
  readonly output?: string;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
}

export interface AutomationWorkflowStepRunPatch {
  readonly agentRunId?: string;
  readonly output?: string;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
}

export class AutomationWorkflowStepRun {
  private constructor(
    public readonly id: string,
    public readonly runId: string,
    public readonly stepId: string,
    public readonly agentRunId: string | undefined,
    public readonly status: AutomationWorkflowStepRunStatus,
    public readonly output: string | undefined,
    public readonly startedAt: Date | undefined,
    public readonly finishedAt: Date | undefined,
  ) {
    Object.freeze(this);
  }

  public static create(props: AutomationWorkflowStepRunProps): AutomationWorkflowStepRun {
    return new AutomationWorkflowStepRun(
      props.id,
      props.runId,
      props.stepId,
      props.agentRunId,
      props.status,
      props.output,
      props.startedAt,
      props.finishedAt,
    );
  }

  public withStatus(
    status: AutomationWorkflowStepRunStatus,
    patch: AutomationWorkflowStepRunPatch = {},
  ): AutomationWorkflowStepRun {
    return AutomationWorkflowStepRun.create({
      ...this,
      status,
      agentRunId: patch.agentRunId ?? this.agentRunId,
      output: patch.output ?? this.output,
      startedAt: patch.startedAt ?? this.startedAt,
      finishedAt: patch.finishedAt ?? this.finishedAt,
    });
  }
}
