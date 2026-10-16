export interface CompiledPipelineWorkload {
  readonly pipelineId: string;
  readonly pipelineVersionId: string;
  readonly versionNumber: number;
  readonly connectionId?: string;
  readonly artifactBucket: string;
  readonly objectKey: string;
  readonly objectVersionId: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly source: Uint8Array;
}

export interface ICompiledPipelineProvider {
  resolveCompiledVersion(
    pipelineId: string,
    versionNumber: number,
    options?: { readonly includeOutputFacts?: boolean },
  ): Promise<CompiledPipelineWorkload>;
}
