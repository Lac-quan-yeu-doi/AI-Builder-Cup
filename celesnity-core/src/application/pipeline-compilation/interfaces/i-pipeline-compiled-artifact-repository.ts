export type PipelineArtifactJsonValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: PipelineArtifactJsonValue }
  | readonly PipelineArtifactJsonValue[];

export type PipelineArtifactJsonObject = {
  readonly [key: string]: PipelineArtifactJsonValue;
};

export interface PipelineCompiledArtifactRecord {
  readonly id: string;
  readonly pipelineId: string;
  readonly pipelineName: string;
  readonly pipelineVersionId: string;
  readonly versionNumber: number;
  readonly compilerVersion: string;
  readonly semanticGraphSha256: string;
  readonly bindingsSnapshot: PipelineArtifactJsonValue;
  readonly artifactBucket: string;
  readonly objectKey: string;
  readonly objectVersionId: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly sourceMap: PipelineArtifactJsonValue;
  readonly compiledAt: Date;
}

export interface IPipelineCompiledArtifactRepository {
  find(
    pipelineId: string,
    versionNumber: number,
  ): Promise<PipelineCompiledArtifactRecord | undefined>;
  create(record: PipelineCompiledArtifactRecord): Promise<boolean>;
}
