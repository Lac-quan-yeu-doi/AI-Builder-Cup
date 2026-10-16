import type { WorkflowGraphValidationIssue } from '@domain/data-workflow/models/workflow-graph';

export enum WorkflowAuthoringErrorCode {
  INVALID_GRAPH = 'WORKFLOW_GRAPH_INVALID',
  INVALID_NAME = 'WORKFLOW_NAME_INVALID',
  NOT_FOUND = 'WORKFLOW_NOT_FOUND',
  REVISION_CONFLICT = 'WORKFLOW_REVISION_CONFLICT',
}

export class WorkflowAuthoringError extends Error {
  private constructor(
    public readonly code: WorkflowAuthoringErrorCode,
    message: string,
    public readonly issues: readonly WorkflowGraphValidationIssue[] = [],
  ) {
    super(message);
    this.name = WorkflowAuthoringError.name;
  }

  public static invalidGraph(
    issues: readonly WorkflowGraphValidationIssue[] = [],
  ): WorkflowAuthoringError {
    return new WorkflowAuthoringError(
      WorkflowAuthoringErrorCode.INVALID_GRAPH,
      'The workflow graph is invalid.',
      issues,
    );
  }

  public static invalidName(): WorkflowAuthoringError {
    return new WorkflowAuthoringError(
      WorkflowAuthoringErrorCode.INVALID_NAME,
      'Workflow name must contain 1 to 160 characters.',
    );
  }

  public static notFound(): WorkflowAuthoringError {
    return new WorkflowAuthoringError(
      WorkflowAuthoringErrorCode.NOT_FOUND,
      'The workflow was not found.',
    );
  }

  public static revisionConflict(): WorkflowAuthoringError {
    return new WorkflowAuthoringError(
      WorkflowAuthoringErrorCode.REVISION_CONFLICT,
      'The workflow changed while this operation was in progress.',
    );
  }
}
