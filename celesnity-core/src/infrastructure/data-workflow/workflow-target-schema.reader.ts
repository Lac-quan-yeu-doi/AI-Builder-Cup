import { Inject, Injectable } from '@nestjs/common';

import type { IPipelineVersionRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-version-repository';
import type {
  IWorkflowTargetSchemaReader,
  WorkflowPipelineTargetSchema,
} from '@application/data-workflow/interfaces/i-workflow-target-schema-reader';
import type { PipelineReference } from '@application/data-workflow/interfaces/i-workflow-access';
import { PipelineSchemaValidator } from '@application/pipeline-authoring/pipeline-schema.validator';
import { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import { PipelineError } from '@domain/pipeline-authoring/errors/pipeline.errors';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';
import type { PipelineNode } from '@domain/pipeline-authoring/models/pipeline';
import { PIPELINE_VERSION_REPOSITORY } from '@application/pipeline-authoring/tokens';

@Injectable()
export class WorkflowTargetSchemaReader implements IWorkflowTargetSchemaReader {
  private readonly schemaValidator: PipelineSchemaValidator;

  public constructor(
    @Inject(PIPELINE_VERSION_REPOSITORY)
    private readonly versions: IPipelineVersionRepository,
    private readonly nodeCatalog: NodeCatalogUseCases,
  ) {
    this.schemaValidator = new PipelineSchemaValidator(this.nodeCatalog);
  }

  public async describe(
    pipeline: PipelineReference,
  ): Promise<readonly WorkflowPipelineTargetSchema[]> {
    const version = await this.versions.find(pipeline.pipelineId, pipeline.versionNumber);
    if (version === undefined) throw PipelineError.notFound();

    const definitions = await this.resolveDefinitions(version.graph.nodes);
    const validation = await this.schemaValidator.validate(version.graph, definitions);
    return version.graph.nodes.flatMap((node) => {
      const definition = definitions.get(node.id);
      if (definition?.type !== 'ICEBERG_TARGET') return [];

      const configTable =
        node.config.tableMode === 'CREATE_NEW'
          ? text(node.config.newTableName)
          : text(node.config.tableName);
      const tableName = configTable ?? definition.target?.tableName;
      if (tableName === undefined) return [];

      const schema = validation.nodeSchemas[node.id];
      return [
        {
          targetNodeId: node.id,
          tableName,
          schemaStatus: schema?.status ?? 'UNAVAILABLE',
          columns:
            schema?.status === 'KNOWN'
              ? schema.columns.map((column) => ({
                  id: column.name,
                  name: column.name,
                  type: column.dataType,
                  nullable: column.nullable,
                }))
              : [],
        },
      ];
    });
  }

  private async resolveDefinitions(
    nodes: readonly PipelineNode[],
  ): Promise<ReadonlyMap<string, NodeDefinition>> {
    const resolved = await Promise.all(
      nodes.map(async (node) => {
        const definition = await this.nodeCatalogDefinition(node);
        if (definition === undefined) throw PipelineError.notFound();
        return [node.id, definition] as const;
      }),
    );
    return new Map(resolved);
  }

  private nodeCatalogDefinition(node: PipelineNode): Promise<NodeDefinition | undefined> {
    const resourceId =
      node.resourceId ??
      (text(node.config.connectionId) === undefined
        ? undefined
        : `connection:${text(node.config.connectionId)}`);
    return this.nodeCatalog.resolveDefinition(node.definitionType, resourceId);
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
