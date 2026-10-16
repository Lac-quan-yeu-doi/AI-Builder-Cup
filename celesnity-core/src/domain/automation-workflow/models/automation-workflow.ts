export type AutomationWorkflowStatus = 'draft' | 'enabled';
export type AutomationWorkflowTriggerType = 'EVENT' | 'SCHEDULE';

export type AutomationWorkflowTriggerFieldType =
  'text' | 'number' | 'date' | 'datetime' | 'boolean';

export interface AutomationWorkflowTriggerField {
  readonly name: string;
  readonly type: AutomationWorkflowTriggerFieldType;
  readonly label?: string;
  readonly required?: boolean;
}

export interface AutomationWorkflowProps {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly status: AutomationWorkflowStatus;
  readonly triggerType: AutomationWorkflowTriggerType;
  readonly eventTopic?: string;
  readonly scheduleCron?: string;
  readonly scheduleTimezone?: string;
  readonly nextRunAt?: Date;
  readonly triggerFields?: readonly AutomationWorkflowTriggerField[];
  readonly createdBy: string;
  readonly createdAt: Date;
}

export class AutomationWorkflow {
  private constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public readonly name: string,
    public readonly status: AutomationWorkflowStatus,
    public readonly triggerType: AutomationWorkflowTriggerType,
    public readonly eventTopic: string | undefined,
    public readonly scheduleCron: string | undefined,
    public readonly scheduleTimezone: string | undefined,
    public readonly nextRunAt: Date | undefined,
    public readonly triggerFields: readonly AutomationWorkflowTriggerField[],
    public readonly createdBy: string,
    public readonly createdAt: Date,
  ) {
    Object.freeze(this);
  }

  public static create(props: AutomationWorkflowProps): AutomationWorkflow {
    return new AutomationWorkflow(
      props.id,
      props.organizationId,
      props.name,
      props.status,
      props.triggerType,
      props.eventTopic,
      props.scheduleCron,
      props.scheduleTimezone,
      props.nextRunAt,
      props.triggerFields ?? [],
      props.createdBy,
      props.createdAt,
    );
  }

  public withStatus(status: AutomationWorkflowStatus): AutomationWorkflow {
    return AutomationWorkflow.create({ ...this, status });
  }

  public withNextRunAt(nextRunAt: Date): AutomationWorkflow {
    return AutomationWorkflow.create({ ...this, nextRunAt });
  }
}
