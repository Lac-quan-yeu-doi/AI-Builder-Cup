/** Aggregate counts tied to one pipeline execution; customer row payloads stay outside Core. */
export interface WorkflowRunDataTargetFacts {
  readonly targetNodeId: string;
  readonly totalRows: number;
  readonly matchesByBranchId: Readonly<Record<string, number>>;
}

/** Facts are keyed by workflow Pipeline node and carry the execution identity they describe. */
export interface WorkflowPipelineRunDataFacts {
  readonly executionId: string;
  readonly targets: readonly WorkflowRunDataTargetFacts[];
}
