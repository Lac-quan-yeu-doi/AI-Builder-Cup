export type ExecutionWorkload =
  | {
      readonly kind: 'SCRIPT';
      readonly scriptId: string;
      readonly scriptVersionId: string;
      readonly versionNumber: number;
    }
  | {
      readonly kind: 'PIPELINE';
      readonly pipelineId: string;
      readonly pipelineVersionId: string;
      readonly versionNumber: number;
    };
