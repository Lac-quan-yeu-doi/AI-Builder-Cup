import type { Prisma } from '@generated/prisma/client';

import type { PipelineCompiledArtifactRecord } from '@application/pipeline-compilation/interfaces/i-pipeline-compiled-artifact-repository';

export const PIPELINE_COMPILED_ARTIFACT_SELECTION = {
  id: true,
  pipelineVersionId: true,
  compilerVersion: true,
  semanticGraphSha256: true,
  bindingsSnapshot: true,
  artifactBucket: true,
  objectKey: true,
  objectVersionId: true,
  contentSha256: true,
  contentSize: true,
  sourceMap: true,
  compiledAt: true,
  pipelineVersion: {
    select: {
      pipelineId: true,
      versionNumber: true,
      pipeline: { select: { name: true } },
    },
  },
} as const satisfies Prisma.PipelineCompiledArtifactSelect;

type PipelineCompiledArtifactRow = Prisma.PipelineCompiledArtifactGetPayload<{
  select: typeof PIPELINE_COMPILED_ARTIFACT_SELECTION;
}>;

export class PipelineCompiledArtifactMapper {
  public toApplication(row: PipelineCompiledArtifactRow): PipelineCompiledArtifactRecord {
    return {
      id: row.id,
      pipelineId: row.pipelineVersion.pipelineId,
      pipelineName: row.pipelineVersion.pipeline.name,
      pipelineVersionId: row.pipelineVersionId,
      versionNumber: row.pipelineVersion.versionNumber,
      compilerVersion: row.compilerVersion,
      semanticGraphSha256: row.semanticGraphSha256,
      bindingsSnapshot:
        row.bindingsSnapshot as unknown as PipelineCompiledArtifactRecord['bindingsSnapshot'],
      artifactBucket: row.artifactBucket,
      objectKey: row.objectKey,
      objectVersionId: row.objectVersionId,
      contentSha256: row.contentSha256,
      contentSize: row.contentSize,
      sourceMap: row.sourceMap as unknown as PipelineCompiledArtifactRecord['sourceMap'],
      compiledAt: row.compiledAt,
    };
  }

  public toPersistence(
    record: PipelineCompiledArtifactRecord,
  ): Prisma.PipelineCompiledArtifactUncheckedCreateInput {
    return {
      id: record.id,
      pipelineVersionId: record.pipelineVersionId,
      compilerVersion: record.compilerVersion,
      semanticGraphSha256: record.semanticGraphSha256,
      bindingsSnapshot: record.bindingsSnapshot as Prisma.InputJsonValue,
      artifactBucket: record.artifactBucket,
      objectKey: record.objectKey,
      objectVersionId: record.objectVersionId,
      contentSha256: record.contentSha256,
      contentSize: record.contentSize,
      sourceMap: record.sourceMap as Prisma.InputJsonValue,
      compiledAt: record.compiledAt,
    };
  }
}
