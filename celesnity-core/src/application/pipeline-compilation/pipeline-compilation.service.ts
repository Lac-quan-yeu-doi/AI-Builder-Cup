import type { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import type { IPipelineRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-repository';
import type { IPipelineVersionRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-version-repository';
import type {
  IPipelineCompiledArtifactRepository,
  PipelineArtifactJsonObject,
  PipelineArtifactJsonValue,
  PipelineCompiledArtifactRecord,
} from '@application/pipeline-compilation/interfaces/i-pipeline-compiled-artifact-repository';
import type {
  CompiledPipelineWorkload,
  ICompiledPipelineProvider,
} from '@application/pipeline-compilation/interfaces/i-compiled-pipeline-provider';
import {
  OUTPUT_FACTS_CAPABILITY_MARKER,
  type PipelineCompiler,
} from '@application/pipeline-compilation/pipeline-compiler';
import type { ISourceArtifactStore } from '@application/script-authoring/interfaces/i-source-artifact-store';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';
import { PipelineError } from '@domain/pipeline-authoring/errors/pipeline.errors';
import type { PipelineGraph, PipelineNode } from '@domain/pipeline-authoring/models/pipeline';
import { PipelineSchemaValidator } from '@application/pipeline-authoring/pipeline-schema.validator';
import { PipelineCompilationError } from '@domain/pipeline-compilation/errors/pipeline-compilation.error';
import {
  ArtifactLocation,
  ArtifactVersionId,
  SourceHash,
} from '@domain/script-authoring/value-objects/script-value-objects';

export interface PipelineCompilationView {
  readonly pipelineId: string;
  readonly pipelineVersionId: string;
  readonly versionNumber: number;
  readonly compilerVersion: string;
  readonly semanticGraphSha256: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly sourceMap: PipelineArtifactJsonValue;
  readonly compiledAt: string;
  readonly source?: string;
}

export class PipelineCompilationService implements ICompiledPipelineProvider {
  public constructor(
    private readonly pipelines: IPipelineRepository,
    private readonly versions: IPipelineVersionRepository,
    private readonly artifacts: IPipelineCompiledArtifactRepository,
    private readonly artifactStore: ISourceArtifactStore,
    private readonly nodeCatalog: NodeCatalogUseCases,
    private readonly compiler: PipelineCompiler,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly artifactsBucket: string,
    private readonly sourceMaxBytes: number,
  ) {}

  public async compile(
    pipelineId: string,
    versionNumber: number,
  ): Promise<PipelineCompilationView> {
    const [pipeline, version] = await Promise.all([
      this.pipelines.findActiveById(pipelineId),
      this.versions.find(pipelineId, versionNumber),
    ]);
    if (pipeline === undefined || version === undefined) throw PipelineError.notFound();

    const definitions = await this.resolveDefinitions(version.graph);
    await this.assertSchemaValid(version.graph, definitions);
    const existing = await this.artifacts.find(pipelineId, versionNumber);
    if (existing !== undefined) return this.view(existing);
    const compiled = this.compiler.compile({
      pipelineId,
      pipelineVersion: versionNumber,
      pipelineName: pipeline.name,
      graph: version.graph,
      definitionsByNodeId: definitions,
    });
    const content = Buffer.from(compiled.source, 'utf8');
    if (content.length < 1 || content.length > this.sourceMaxBytes) {
      throw PipelineCompilationError.issue(
        'PIPELINE_NOT_COMPILABLE',
        `Generated source must be between 1 and ${String(this.sourceMaxBytes)} bytes.`,
      );
    }
    const location = ArtifactLocation.create(
      this.artifactsBucket,
      `pipelines/${pipelineId}/versions/${String(versionNumber)}/${compiled.compilerVersion}/${compiled.sourceSha256}/main.py`,
    );
    const identity = await this.artifactStore.putVerified(
      location,
      content,
      SourceHash.fromSha256(compiled.sourceSha256),
    );
    const record: PipelineCompiledArtifactRecord = {
      id: this.ids.next(),
      pipelineId,
      pipelineName: pipeline.name,
      pipelineVersionId: version.id,
      versionNumber,
      compilerVersion: compiled.compilerVersion,
      semanticGraphSha256: compiled.semanticGraphSha256,
      bindingsSnapshot: this.bindingsSnapshot(version.graph, definitions),
      artifactBucket: location.bucket,
      objectKey: location.objectKey,
      objectVersionId: identity.versionId.value,
      contentSha256: compiled.sourceSha256,
      contentSize: content.length,
      sourceMap: compiled.sourceMap as unknown as PipelineArtifactJsonValue,
      compiledAt: this.clock.now(),
    };
    if (!(await this.artifacts.create(record))) {
      const landed = await this.artifacts.find(pipelineId, versionNumber);
      if (landed === undefined || landed.contentSha256 !== record.contentSha256) {
        throw PipelineCompilationError.issue(
          'PIPELINE_NOT_COMPILABLE',
          'A different compiled artifact already exists for this pipeline version.',
        );
      }
      return this.view(landed);
    }
    return this.view(record);
  }

  public async generatedSource(
    pipelineId: string,
    versionNumber: number,
  ): Promise<PipelineCompilationView> {
    const record = await this.requireArtifact(pipelineId, versionNumber);
    const source = await this.readVerified(record);
    return { ...this.view(record), source: Buffer.from(source).toString('utf8') };
  }

  public async resolveCompiledVersion(
    pipelineId: string,
    versionNumber: number,
    options?: { readonly includeOutputFacts?: boolean },
  ): Promise<CompiledPipelineWorkload> {
    const version = await this.versions.find(pipelineId, versionNumber);
    if (version === undefined) throw PipelineError.notFound();
    const definitions = await this.resolveDefinitions(version.graph);
    await this.assertSchemaValid(version.graph, definitions);
    const record = await this.requireArtifact(pipelineId, versionNumber);
    const bindings = bindingsRecord(record.bindingsSnapshot);
    let source = await this.readVerified(record);
    if (
      options?.includeOutputFacts === true &&
      !Buffer.from(source).toString('utf8').includes(OUTPUT_FACTS_CAPABILITY_MARKER)
    ) {
      const publishedVersion = await this.versions.find(pipelineId, versionNumber);
      if (publishedVersion === undefined) throw PipelineError.notFound();
      const definitions = await this.resolveDefinitions(publishedVersion.graph);
      await this.assertSchemaValid(publishedVersion.graph, definitions);
      const regenerated = this.compiler.compile({
        pipelineId,
        pipelineVersion: versionNumber,
        pipelineName: record.pipelineName,
        graph: publishedVersion.graph,
        definitionsByNodeId: definitions,
      });
      source = Buffer.from(regenerated.source, 'utf8');
      if (source.byteLength < 1 || source.byteLength > this.sourceMaxBytes) {
        throw PipelineCompilationError.issue(
          'PIPELINE_NOT_COMPILABLE',
          `Generated source must be between 1 and ${String(this.sourceMaxBytes)} bytes.`,
        );
      }
    }
    return {
      pipelineId: record.pipelineId,
      pipelineVersionId: record.pipelineVersionId,
      versionNumber: record.versionNumber,
      ...(optionalText(bindings.sourceConnectionId) === undefined
        ? {}
        : { connectionId: optionalText(bindings.sourceConnectionId) }),
      artifactBucket: record.artifactBucket,
      objectKey: record.objectKey,
      objectVersionId: record.objectVersionId,
      contentSha256: record.contentSha256,
      contentSize: record.contentSize,
      source,
    };
  }

  private async requireArtifact(
    pipelineId: string,
    versionNumber: number,
  ): Promise<PipelineCompiledArtifactRecord> {
    const record = await this.artifacts.find(pipelineId, versionNumber);
    if (record === undefined) {
      throw PipelineCompilationError.issue(
        'PIPELINE_ARTIFACT_NOT_FOUND',
        'Compile this pipeline version before running it.',
      );
    }
    return record;
  }

  private readVerified(record: PipelineCompiledArtifactRecord): Promise<Uint8Array> {
    return this.artifactStore.readVerified(
      ArtifactLocation.create(record.artifactBucket, record.objectKey),
      ArtifactVersionId.create(record.objectVersionId),
      SourceHash.fromSha256(record.contentSha256),
      record.contentSize,
    );
  }

  private async resolveDefinitions(
    graph: PipelineGraph,
  ): Promise<ReadonlyMap<string, NodeDefinition>> {
    const entries = await Promise.all(
      graph.nodes.map(async (node): Promise<readonly [string, NodeDefinition]> => {
        const definition = await this.nodeCatalog.resolveDefinition(
          node.definitionType,
          resourceId(node),
        );
        if (definition === undefined) {
          throw PipelineCompilationError.issue(
            'PIPELINE_NOT_COMPILABLE',
            'A node definition or bound resource is unavailable.',
            { nodeId: node.id },
          );
        }
        return [node.id, definition] as const;
      }),
    );
    return new Map(entries);
  }

  private async assertSchemaValid(
    graph: PipelineGraph,
    definitions: ReadonlyMap<string, NodeDefinition>,
  ): Promise<void> {
    const validation = await new PipelineSchemaValidator(this.nodeCatalog).validate(
      graph,
      definitions,
    );
    const first = validation.errors[0];
    if (first !== undefined) {
      throw PipelineCompilationError.issue(
        'PIPELINE_NOT_COMPILABLE',
        `${first.code}: ${first.message}`,
        {
          ...(first.nodeId === undefined ? {} : { nodeId: first.nodeId }),
          ...(first.field === undefined ? {} : { field: first.field }),
        },
      );
    }
  }

  private bindingsSnapshot(
    graph: PipelineGraph,
    definitions: ReadonlyMap<string, NodeDefinition>,
  ): PipelineArtifactJsonObject {
    const source = graph.nodes
      .map((node) => definitions.get(node.id))
      .find((definition) => definition?.category === 'SOURCE');
    if (source === undefined) {
      throw PipelineCompilationError.issue(
        'SOURCE_COUNT_UNSUPPORTED',
        'The pipeline requires exactly one source.',
      );
    }
    return {
      ...(source.source === undefined
        ? {}
        : {
            sourceConnectionId: source.source.connectionId,
            sourceConnectionName: source.source.connectionName,
          }),
      targets: graph.nodes
        .filter((node) => definitions.get(node.id)?.category === 'TARGET')
        .map((node) => {
          const target = definitions.get(node.id)?.target;
          const databaseName =
            typeof node.config.databaseName === 'string'
              ? node.config.databaseName
              : target?.databaseName;
          const tableName =
            node.config.tableMode === 'CREATE_NEW'
              ? typeof node.config.newTableName === 'string'
                ? node.config.newTableName
                : undefined
              : typeof node.config.tableName === 'string'
                ? node.config.tableName
                : target?.tableName;
          if (databaseName === undefined || tableName === undefined) {
            throw PipelineCompilationError.issue(
              'NODE_CONFIG_INVALID',
              'The Iceberg target database and table are required.',
              { nodeId: node.id },
            );
          }
          return {
            catalogName: target?.catalogName ?? this.catalogName(definitions.get(node.id)),
            databaseName,
            tableName,
          };
        }),
    };
  }

  private catalogName(definition: NodeDefinition | undefined): string {
    const resourceId = definition?.resourceId;
    if (resourceId?.startsWith('iceberg:') !== true) {
      throw PipelineCompilationError.issue(
        'NODE_CONFIG_INVALID',
        'The Iceberg target catalog binding is unavailable.',
      );
    }
    return resourceId.slice('iceberg:'.length).split('.')[0] as string;
  }

  private view(record: PipelineCompiledArtifactRecord): PipelineCompilationView {
    return {
      pipelineId: record.pipelineId,
      pipelineVersionId: record.pipelineVersionId,
      versionNumber: record.versionNumber,
      compilerVersion: record.compilerVersion,
      semanticGraphSha256: record.semanticGraphSha256,
      contentSha256: record.contentSha256,
      contentSize: record.contentSize,
      sourceMap: record.sourceMap,
      compiledAt: record.compiledAt.toISOString(),
    };
  }
}

function resourceId(node: PipelineNode): string | undefined {
  return (
    node.resourceId ??
    (typeof node.config.connectionId === 'string'
      ? `connection:${node.config.connectionId}`
      : undefined)
  );
}

function bindingsRecord(value: PipelineArtifactJsonValue): PipelineArtifactJsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw PipelineCompilationError.issue('PIPELINE_NOT_COMPILABLE', 'Bindings are corrupted.');
  }
  return value as PipelineArtifactJsonObject;
}

function optionalText(value: PipelineArtifactJsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
