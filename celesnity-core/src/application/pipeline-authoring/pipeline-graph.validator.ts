import type { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import { PipelineCompiler } from '@application/pipeline-compilation/pipeline-compiler';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';
import { PipelineCompilationError } from '@domain/pipeline-compilation/errors/pipeline-compilation.error';
import type {
  PipelineEdge,
  PipelineGraph,
  PipelineValidationIssue,
  PipelineValidationResult,
} from '@domain/pipeline-authoring/models/pipeline';
import { PipelineSchemaValidator } from '@application/pipeline-authoring/pipeline-schema.validator';

export class PipelineGraphValidator {
  private readonly schemaValidator: PipelineSchemaValidator;

  public constructor(
    private readonly nodeCatalog: NodeCatalogUseCases,
    private readonly compiler = new PipelineCompiler(),
  ) {
    this.schemaValidator = new PipelineSchemaValidator(nodeCatalog);
  }

  public async validate(graph: PipelineGraph): Promise<PipelineValidationResult> {
    const errors: PipelineValidationIssue[] = [];
    const warnings: PipelineValidationIssue[] = [];
    if (graph.nodes.length === 0) {
      errors.push(issue('GRAPH_EMPTY', 'The graph has no nodes.'));
      return { valid: false, errors, warnings };
    }

    const duplicateNodeIds = duplicates(graph.nodes.map((node) => node.id));
    duplicateNodeIds.forEach((nodeId) =>
      errors.push(issue('NODE_CONFIG_INVALID', 'Node identifiers must be unique.', { nodeId })),
    );

    const definitions = new Map<string, NodeDefinition>();
    await Promise.all(
      graph.nodes.map(async (node) => {
        const resourceId =
          node.resourceId ??
          (typeof node.config.connectionId === 'string'
            ? `connection:${node.config.connectionId}`
            : undefined);
        const definition = await this.nodeCatalog.resolveDefinition(
          node.definitionType,
          resourceId,
        );
        if (definition === undefined) {
          errors.push(
            issue(
              'NODE_DEFINITION_NOT_FOUND',
              'The node definition does not exist or is disabled.',
              {
                nodeId: node.id,
              },
            ),
          );
          return;
        }
        definitions.set(node.id, definition);
        const fields = definition.propertyPanel.sections.flatMap((section) => section.fields);
        for (const field of fields) {
          if (!fieldVisible(field, node.config, fields)) {
            continue;
          }
          const value = effectiveFieldValue(field, node.config);
          if (
            field.required &&
            missing(value) &&
            !legacyDirectSourceField(definition, node.config, field.key)
          ) {
            errors.push(
              issue('NODE_CONFIG_REQUIRED', `${field.label} is required.`, {
                nodeId: node.id,
                field: field.key,
              }),
            );
          } else if (!missing(value) && !validFieldValue(field, value)) {
            errors.push(
              issue('NODE_CONFIG_INVALID', `${field.label} has an invalid value.`, {
                nodeId: node.id,
                field: field.key,
              }),
            );
          }
        }
        if (definition.type === 'ICEBERG_TARGET') {
          const tableMode = targetTableMode(node.config);
          const databaseName =
            typeof node.config.databaseName === 'string'
              ? node.config.databaseName
              : definition.target?.databaseName;
          if (
            databaseName !== undefined &&
            databaseName.trim() !== '' &&
            !(await this.nodeCatalog.isWritableDatabase(databaseName))
          ) {
            errors.push(
              issue(
                'TARGET_NOT_WRITABLE',
                'Select a writable Iceberg database outside system databases.',
                { nodeId: node.id, field: 'databaseName' },
              ),
            );
          } else if (tableMode === 'CREATE_NEW') {
            const newTableName = node.config.newTableName;
            if (
              typeof newTableName === 'string' &&
              newTableName.trim() !== '' &&
              !/^[A-Za-z0-9_]+$/u.test(newTableName)
            ) {
              errors.push(
                issue(
                  'NODE_CONFIG_INVALID',
                  'New table name may only contain letters, digits, and underscores.',
                  { nodeId: node.id, field: 'newTableName' },
                ),
              );
            } else if (
              databaseName !== undefined &&
              typeof newTableName === 'string' &&
              newTableName.trim() !== '' &&
              (await this.nodeCatalog.isWritableTarget(databaseName, newTableName))
            ) {
              errors.push(
                issue('TARGET_ALREADY_EXISTS', 'A table with this name already exists.', {
                  nodeId: node.id,
                  field: 'newTableName',
                }),
              );
            }
          } else {
            const tableName =
              typeof node.config.tableName === 'string'
                ? node.config.tableName
                : definition.target?.tableName;
            if (
              databaseName !== undefined &&
              databaseName.trim() !== '' &&
              tableName !== undefined &&
              tableName.trim() !== '' &&
              !(await this.nodeCatalog.isWritableTarget(databaseName, tableName))
            ) {
              errors.push(
                issue(
                  'TARGET_NOT_WRITABLE',
                  'Select an existing writable Iceberg table outside system databases.',
                  { nodeId: node.id, field: 'tableName' },
                ),
              );
            }
          }
        }
        if (definition.type === 'ICEBERG_SOURCE') {
          const catalogDatabaseName = text(node.config.catalogDatabaseName);
          const catalogTableName = text(node.config.catalogTableName);
          if (
            catalogDatabaseName === undefined ||
            catalogTableName === undefined ||
            !(await this.nodeCatalog.isWritableTarget(catalogDatabaseName, catalogTableName))
          ) {
            errors.push(
              issue(
                'CATALOG_SOURCE_INVALID',
                'Select an existing managed Iceberg database and table.',
                { nodeId: node.id, field: 'catalogTableName' },
              ),
            );
          }
        }
        if (definition.type === 'POSTGRES_SOURCE') {
          const sourceMode = text(node.config.sourceMode) ?? 'DIRECT';
          const namespaceId = text(node.config.catalogNamespaceId);
          const relationId = text(node.config.catalogRelationId);
          const databaseServiceId = definition.source?.connectionId;
          const schemaName = text(node.config.schemaName);
          const physicalTableName = text(node.config.tableName);
          const usesCrawlerBinding =
            sourceMode === 'CATALOG' || namespaceId !== undefined || relationId !== undefined;
          if (sourceMode === 'ICEBERG_CATALOG') {
            const catalogDatabaseName = text(node.config.catalogDatabaseName);
            const catalogTableName = text(node.config.catalogTableName);
            if (
              catalogDatabaseName === undefined ||
              catalogTableName === undefined ||
              !(await this.nodeCatalog.isWritableTarget(catalogDatabaseName, catalogTableName))
            ) {
              errors.push(
                issue(
                  'CATALOG_SOURCE_INVALID',
                  'Select an existing managed Iceberg database and table.',
                  { nodeId: node.id, field: 'catalogTableName' },
                ),
              );
            }
          } else if (
            usesCrawlerBinding &&
            databaseServiceId !== undefined &&
            namespaceId !== undefined &&
            relationId !== undefined
          ) {
            const source = await this.nodeCatalog.resolveCatalogSource(
              databaseServiceId,
              namespaceId,
              relationId,
            );
            if (
              source === undefined ||
              databaseServiceId !== source.databaseServiceId ||
              schemaName !== source.schemaName ||
              physicalTableName !== source.tableName
            ) {
              errors.push(
                issue(
                  'CATALOG_SOURCE_INVALID',
                  'Select a current metadata relation from the assigned crawler for this database service.',
                  { nodeId: node.id, field: 'catalogRelationId' },
                ),
              );
            }
          } else if (
            sourceMode === 'CATALOG' ||
            (usesCrawlerBinding && (namespaceId === undefined || relationId === undefined)) ||
            schemaName === undefined ||
            physicalTableName === undefined
          ) {
            errors.push(
              issue(
                'CATALOG_SOURCE_INVALID',
                'Select a current metadata relation from the assigned crawler for this database service.',
                { nodeId: node.id, field: 'catalogRelationId' },
              ),
            );
          }
        }
      }),
    );

    if (![...definitions.values()].some((definition) => definition.category === 'SOURCE')) {
      errors.push(issue('GRAPH_SOURCE_REQUIRED', 'The graph requires at least one source node.'));
    }
    if (![...definitions.values()].some((definition) => definition.category === 'TARGET')) {
      errors.push(issue('GRAPH_TARGET_REQUIRED', 'The graph requires at least one target node.'));
    }

    for (const edge of graph.edges) {
      errors.push(...this.edgeErrors(graph, edge, definitions));
    }
    if (hasCycle(graph)) {
      errors.push(issue('GRAPH_HAS_CYCLE', 'The graph contains a cycle.'));
    }
    const disconnected = disconnectedNodeIds(graph);
    if (disconnected.length > 0) {
      errors.push(issue('GRAPH_DISCONNECTED', 'The graph contains a disconnected branch.'));
    }
    for (const nodeId of graph.nodes
      .filter(
        (node) =>
          !graph.edges.some(
            (edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id,
          ),
      )
      .map((node) => node.id)) {
      warnings.push(issue('NODE_NOT_CONNECTED', 'The node is not connected.', { nodeId }));
    }
    const schemaValidation = hasCycle(graph)
      ? { errors: [], warnings: [], nodeSchemas: {} }
      : await this.schemaValidator.validate(graph, definitions);
    errors.push(...schemaValidation.errors);
    warnings.push(...schemaValidation.warnings);
    if (errors.length === 0) {
      errors.push(...this.compilationErrors(graph, definitions));
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      ...(Object.keys(schemaValidation.nodeSchemas).length === 0
        ? {}
        : { nodeSchemas: schemaValidation.nodeSchemas }),
    };
  }

  /**
   * Saving creates an immutable runnable version, so graph validity alone is
   * insufficient. A dry compilation verifies every registered node emitter,
   * structured configuration, input/output binding, and generated PySpark
   * fragment before persistence.
   */
  private compilationErrors(
    graph: PipelineGraph,
    definitions: ReadonlyMap<string, NodeDefinition>,
  ): PipelineValidationIssue[] {
    try {
      this.compiler.compile({
        pipelineId: '00000000-0000-4000-8000-000000000000',
        pipelineVersion: 1,
        pipelineName: 'Pipeline eligibility check',
        graph,
        definitionsByNodeId: definitions,
      });
      return [];
    } catch (error) {
      if (error instanceof PipelineCompilationError) {
        return error.issues.map((item) =>
          issue(item.code, item.message, {
            ...(item.nodeId === undefined ? {} : { nodeId: item.nodeId }),
            ...(item.field === undefined ? {} : { field: item.field }),
          }),
        );
      }
      return [
        issue(
          'PIPELINE_NOT_COMPILABLE',
          'The generated PySpark source could not be verified. Correct the graph before saving.',
        ),
      ];
    }
  }

  public async validateEdge(
    graph: PipelineGraph,
    edge: PipelineEdge,
  ): Promise<Pick<PipelineValidationResult, 'valid' | 'errors'>> {
    const definitions = new Map<string, NodeDefinition>();
    await Promise.all(
      graph.nodes.map(async (node) => {
        const resourceId =
          node.resourceId ??
          (typeof node.config.connectionId === 'string'
            ? `connection:${node.config.connectionId}`
            : undefined);
        const definition = await this.nodeCatalog.resolveDefinition(
          node.definitionType,
          resourceId,
        );
        if (definition !== undefined) {
          definitions.set(node.id, definition);
        }
      }),
    );
    const errors = this.edgeErrors(graph, edge, definitions);
    if (edge.sourceNodeId !== edge.targetNodeId && wouldCreateCycle(graph, edge)) {
      errors.push(issue('GRAPH_HAS_CYCLE', 'The edge would create a cycle.', edgeRef(edge)));
    }
    return { valid: errors.length === 0, errors };
  }

  private edgeErrors(
    graph: PipelineGraph,
    edge: PipelineEdge,
    definitions: ReadonlyMap<string, NodeDefinition>,
  ): PipelineValidationIssue[] {
    const ref = edgeRef(edge);
    if (edge.sourceNodeId === edge.targetNodeId) {
      return [issue('EDGE_SELF_CONNECTION', 'A node cannot connect to itself.', ref)];
    }
    if (
      graph.edges.some(
        (existing) =>
          existing !== edge &&
          existing.sourceNodeId === edge.sourceNodeId &&
          existing.sourcePortId === edge.sourcePortId &&
          existing.targetNodeId === edge.targetNodeId &&
          existing.targetPortId === edge.targetPortId,
      )
    ) {
      return [issue('EDGE_ALREADY_EXISTS', 'The edge already exists.', ref)];
    }
    const source = definitions.get(edge.sourceNodeId);
    const target = definitions.get(edge.targetNodeId);
    if (source?.type === 'FILTER' && edge.sourcePortId === 'rejected') {
      return [
        issue(
          'LEGACY_FILTER_REJECTED_UNSUPPORTED',
          'FILTER now keeps matched rows only; the rejected branch must be repaired.',
          ref,
        ),
      ];
    }
    const sourcePortId =
      source?.type === 'FILTER' &&
      edge.sourcePortId === 'matched' &&
      source.outputPorts.some((port) => port.id === 'output')
        ? 'output'
        : edge.sourcePortId;
    const output = source?.outputPorts.find((port) => port.id === sourcePortId);
    const input = target?.inputPorts.find((port) => port.id === edge.targetPortId);
    if (output === undefined || input === undefined || output.dataType !== input.dataType) {
      return [issue('EDGE_TYPE_INCOMPATIBLE', 'The selected ports are incompatible.', ref)];
    }
    return [];
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function legacyDirectSourceField(
  definition: NodeDefinition,
  config: Readonly<Record<string, unknown>>,
  field: string,
): boolean {
  return (
    definition.type === 'POSTGRES_SOURCE' &&
    (config.sourceMode === undefined || config.sourceMode === 'DIRECT') &&
    (field === 'catalogNamespaceId' || field === 'catalogRelationId') &&
    text(config.catalogNamespaceId) === undefined &&
    text(config.catalogRelationId) === undefined &&
    text(config.schemaName) !== undefined &&
    text(config.tableName) !== undefined
  );
}

function issue(
  code: string,
  message: string,
  details: Partial<Pick<PipelineValidationIssue, 'nodeId' | 'edgeId' | 'field'>> = {},
): PipelineValidationIssue {
  return { code, message, ...details };
}

function edgeRef(edge: PipelineEdge): Pick<PipelineValidationIssue, 'edgeId'> {
  return edge.id === undefined ? {} : { edgeId: edge.id };
}

function missing(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function effectiveFieldValue(
  field: NodeDefinition['propertyPanel']['sections'][number]['fields'][number],
  config: Readonly<Record<string, unknown>>,
): unknown {
  return config[field.key] ?? field.defaultValue;
}

function fieldVisible(
  field: NodeDefinition['propertyPanel']['sections'][number]['fields'][number],
  config: Readonly<Record<string, unknown>>,
  fields: readonly NodeDefinition['propertyPanel']['sections'][number]['fields'][number][],
): boolean {
  if (field.visibleWhen === undefined) {
    return true;
  }
  const controller = fields.find((candidate) => candidate.key === field.visibleWhen?.field);
  const value = config[field.visibleWhen.field] ?? controller?.defaultValue;
  return value === field.visibleWhen.equals;
}

function targetTableMode(config: Readonly<Record<string, unknown>>): 'CREATE_NEW' | 'EXISTING' {
  return config.tableMode === 'CREATE_NEW' ? 'CREATE_NEW' : 'EXISTING';
}

function validFieldValue(
  field: NodeDefinition['propertyPanel']['sections'][number]['fields'][number],
  value: unknown,
): boolean {
  if (field.component === 'MULTI_SELECT') {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }
  if (
    [
      'FILTER_BUILDER',
      'COLUMN_MAPPING_BUILDER',
      'ORDER_BY_BUILDER',
      'AGGREGATION_BUILDER',
    ].includes(field.component)
  ) {
    return Array.isArray(value) && value.every(isRecord);
  }
  if (field.component === 'TYPED_VALUE') {
    return isRecord(value) && typeof value.type === 'string' && 'value' in value;
  }
  if (field.options !== undefined) {
    return typeof value === 'string' && field.options.some((option) => option.value === value);
  }
  if (['TEXT_INPUT', 'SELECT', 'RADIO', 'SQL_EDITOR'].includes(field.component)) {
    return typeof value === 'string';
  }
  return typeof value === 'object' && value !== null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  values.forEach((value) => (seen.has(value) ? duplicate.add(value) : seen.add(value)));
  return [...duplicate];
}

function hasCycle(graph: PipelineGraph): boolean {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  graph.edges.forEach((edge) => adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    if ((adjacency.get(nodeId) ?? []).some(visit)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return graph.nodes.some((node) => visit(node.id));
}

function wouldCreateCycle(graph: PipelineGraph, edge: PipelineEdge): boolean {
  return hasCycle({ nodes: graph.nodes, edges: [...graph.edges, edge] });
}

function disconnectedNodeIds(graph: PipelineGraph): readonly string[] {
  if (graph.nodes.length < 2) return [];
  const adjacency = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  graph.edges.forEach((edge) => {
    adjacency.get(edge.sourceNodeId)?.add(edge.targetNodeId);
    adjacency.get(edge.targetNodeId)?.add(edge.sourceNodeId);
  });
  const visited = new Set<string>();
  const stack = [graph.nodes[0]?.id].filter((id): id is string => id !== undefined);
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    adjacency.get(current)?.forEach((next) => stack.push(next));
  }
  return graph.nodes.map((node) => node.id).filter((id) => !visited.has(id));
}
