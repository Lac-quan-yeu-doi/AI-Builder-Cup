export enum WorkflowRunErrorCode {
  ACTIVE_RUN_CONFLICT = 'WORKFLOW_ACTIVE_RUN_CONFLICT',
  INVALID_PARAMETERS = 'WORKFLOW_RUN_PARAMETERS_INVALID',
  LEASE_MISMATCH = 'WORKFLOW_RUN_LEASE_MISMATCH',
  NOT_FOUND = 'WORKFLOW_RUN_NOT_FOUND',
  NOT_PUBLISHED = 'WORKFLOW_RUN_NOT_PUBLISHED',
  REVISION_CONFLICT = 'WORKFLOW_RUN_REVISION_CONFLICT',
  RETRY_ACKNOWLEDGEMENT_REQUIRED = 'WORKFLOW_RETRY_ACKNOWLEDGEMENT_REQUIRED',
  RETRY_NOT_ALLOWED = 'WORKFLOW_RETRY_NOT_ALLOWED',
}

export class WorkflowRunError extends Error {
  private constructor(
    public readonly code: WorkflowRunErrorCode,
    message: string,
  ) {
    super(message);
    this.name = WorkflowRunError.name;
  }

  public static activeRunConflict(): WorkflowRunError {
    return new WorkflowRunError(
      WorkflowRunErrorCode.ACTIVE_RUN_CONFLICT,
      'The workflow already has an active run.',
    );
  }

  public static invalidParameters(): WorkflowRunError {
    return new WorkflowRunError(
      WorkflowRunErrorCode.INVALID_PARAMETERS,
      'Workflow run parameters must be a JSON object containing scalar values or nested objects.',
    );
  }

  public static leaseMismatch(): WorkflowRunError {
    return new WorkflowRunError(
      WorkflowRunErrorCode.LEASE_MISMATCH,
      'The workflow run lease token is stale.',
    );
  }

  public static notFound(): WorkflowRunError {
    return new WorkflowRunError(WorkflowRunErrorCode.NOT_FOUND, 'The workflow run was not found.');
  }

  public static notPublished(): WorkflowRunError {
    return new WorkflowRunError(
      WorkflowRunErrorCode.NOT_PUBLISHED,
      'The workflow does not have a published version that can be run.',
    );
  }

  public static revisionConflict(): WorkflowRunError {
    return new WorkflowRunError(
      WorkflowRunErrorCode.REVISION_CONFLICT,
      'The workflow run changed while this operation was in progress.',
    );
  }

  public static retryAcknowledgementRequired(): WorkflowRunError {
    return new WorkflowRunError(
      WorkflowRunErrorCode.RETRY_ACKNOWLEDGEMENT_REQUIRED,
      'Retrying this workflow node may repeat writes and requires acknowledgement.',
    );
  }

  public static retryNotAllowed(): WorkflowRunError {
    return new WorkflowRunError(
      WorkflowRunErrorCode.RETRY_NOT_ALLOWED,
      'The workflow node cannot be retried in its current state.',
    );
  }
}
