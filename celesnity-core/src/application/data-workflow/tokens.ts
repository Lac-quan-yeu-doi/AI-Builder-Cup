export const WORKFLOW_ACCESS = Symbol('IWorkflowAccess');
export const WORKFLOW_PIPELINE_EXECUTOR = Symbol('IWorkflowPipelineExecutor');
export const WORKFLOW_PIPELINE_PREPARER = Symbol('IWorkflowPipelinePreparer');
export const WORKFLOW_PIPELINE_DESCRIPTOR = Symbol('IWorkflowPipelineDescriptor');
export const WORKFLOW_TARGET_SCHEMA_READER = Symbol('IWorkflowTargetSchemaReader');
export const WORKFLOW_NODE_ATTEMPT_EXECUTION_REPOSITORY = Symbol(
  'IWorkflowNodeAttemptExecutionRepository',
);
export const WORKFLOW_RUN_REPOSITORY = Symbol('IWorkflowRunRepository');
export const WORKFLOW_REPOSITORY = Symbol('IWorkflowRepository');
export const WORKFLOW_RUN_CLAIM_STORE = Symbol('IWorkflowRunClaimStore');
export const WORKFLOW_SCHEDULE_REPOSITORY = Symbol('IWorkflowScheduleRepository');
export const WORKFLOW_SCHEDULE_CLAIM_STORE = Symbol('IWorkflowScheduleClaimStore');
export const WORKFLOW_TRIGGER_SCHEDULE = Symbol('IWorkflowTriggerSchedule');
