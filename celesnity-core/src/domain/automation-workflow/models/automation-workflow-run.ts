export type AutomationWorkflowRunTrigger = 'schedule' | 'event' | 'test';
export type AutomationWorkflowRunStatus = 'running' | 'success' | 'failed';

export interface AutomationWorkflowRunProps {
  readonly id: string;
  readonly workflowId: string;
  readonly triggeredBy: AutomationWorkflowRunTrigger;
  readonly status: AutomationWorkflowRunStatus;
  readonly triggerPayload: unknown;
  readonly startedAt: Date;
  readonly finishedAt?: Date;
}

export class AutomationWorkflowRun {
  private constructor(
    public readonly id: string,
    public readonly workflowId: string,
    public readonly triggeredBy: AutomationWorkflowRunTrigger,
    public readonly status: AutomationWorkflowRunStatus,
    public readonly triggerPayload: unknown,
    public readonly startedAt: Date,
    public readonly finishedAt: Date | undefined,
  ) {
    Object.freeze(this);
  }

  public static create(props: AutomationWorkflowRunProps): AutomationWorkflowRun {
    return new AutomationWorkflowRun(
      props.id,
      props.workflowId,
      props.triggeredBy,
      props.status,
      props.triggerPayload,
      props.startedAt,
      props.finishedAt,
    );
  }

  public withStatus(status: AutomationWorkflowRunStatus, finishedAt?: Date): AutomationWorkflowRun {
    return AutomationWorkflowRun.create({
      ...this,
      status,
      finishedAt: finishedAt ?? this.finishedAt,
    });
  }
}
