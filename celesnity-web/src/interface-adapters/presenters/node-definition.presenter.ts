import type {
  NodeDefinition,
  NodeDefinitionSummary,
  NodePalette,
  NodePropertyPanel,
} from '@/src/entities/models/node-definition';

export interface NodeDefinitionSummaryViewModel extends NodeDefinitionSummary {
  /** The connection or table the node binds to, blank for shared transforms. */
  readonly resourceLabel?: string;
}

export interface NodePaletteGroupViewModel {
  readonly type: string;
  readonly label: string;
  readonly definitions: readonly NodeDefinitionSummaryViewModel[];
}

export interface NodeDefinitionViewModel extends NodeDefinitionSummaryViewModel {
  readonly propertyPanel: NodePropertyPanel;
}

export function presentNodePalette(palette: NodePalette): readonly NodePaletteGroupViewModel[] {
  return palette.map((group) => ({
    type: group.category.type,
    label: group.category.label,
    definitions: group.definitions.map(presentNodeDefinitionSummary),
  }));
}

export function presentNodeDefinitionSummary(
  definition: NodeDefinitionSummary,
): NodeDefinitionSummaryViewModel {
  const resourceLabel = describeResource(definition);
  return { ...definition, ...(resourceLabel ? { resourceLabel } : {}) };
}

export function presentNodeDefinition(definition: NodeDefinition): NodeDefinitionViewModel {
  return {
    ...presentNodeDefinitionSummary(definition),
    propertyPanel: definition.propertyPanel,
  };
}

function describeResource(definition: NodeDefinitionSummary): string | undefined {
  if (definition.source) {
    return `${definition.source.dbmsType} · ${definition.source.connectionName}`;
  }
  if (definition.target) {
    return `${definition.target.catalogName}.${definition.target.databaseName}.${definition.target.tableName}`;
  }
  if (definition.resourceId.startsWith('iceberg-source:')) {
    return `ICEBERG · ${definition.resourceId.slice('iceberg-source:'.length)}`;
  }
  return undefined;
}
