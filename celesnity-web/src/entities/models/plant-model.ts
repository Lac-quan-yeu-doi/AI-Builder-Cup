export type PlantPropertyType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'single-select'
  | 'multi-select'
  | 'node-reference'
  | 'catalog-scalar'
  | 'catalog-choices'
  | 'catalog-multi-select';
export type PlantRoutingRole = 'source' | 'intermediate' | 'sink' | 'none';
export type PlantPropertyValue = string | number | boolean | null | readonly string[];

export interface PlantValueSetOption {
  readonly id: string;
  readonly label: string;
  readonly deprecated?: boolean;
}
export interface PlantCatalogBinding {
  readonly mode: 'scalar' | 'choices';
  readonly catalog: string;
  readonly schema: string;
  readonly table: string;
  readonly valueColumn: string;
  readonly labelColumn?: string;
  readonly filters: readonly {
    readonly column: string;
    readonly operator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
    readonly operand:
      | { readonly kind: 'literal'; readonly value: string | number | boolean | null }
      | { readonly kind: 'property'; readonly propertyDefinitionId: string };
  }[];
  readonly orderBy?: { readonly column: string; readonly direction: 'asc' | 'desc' };
  readonly limit?: number;
}
export interface PlantPropertyDefinition {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly type: PlantPropertyType;
  readonly required: boolean;
  readonly description?: string;
  readonly defaultValue?: PlantPropertyValue;
  readonly order: number;
  readonly showOnCard?: boolean;
  readonly options?: readonly PlantValueSetOption[];
  readonly catalogBinding?: PlantCatalogBinding;
}
export interface PlantNodeType {
  readonly id: string;
  readonly name: string;
  readonly properties: readonly PlantPropertyDefinition[];
}
export interface PlantNode {
  readonly id: string;
  readonly name: string;
  readonly nodeTypeId: string;
  readonly routingRole: PlantRoutingRole;
  readonly position: { readonly x: number; readonly y: number };
  readonly values: Readonly<Record<string, PlantPropertyValue>>;
  readonly localProperties: readonly PlantPropertyDefinition[];
}
export interface PlantRelationship {
  readonly id: string;
  readonly kind: 'contains' | 'routes-to';
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly name?: string;
}
export interface PlantModelDraft {
  readonly nodeTypes: readonly PlantNodeType[];
  readonly nodes: readonly PlantNode[];
  readonly relationships: readonly PlantRelationship[];
}
export interface PlantSite {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly timezone: string;
  readonly draft: PlantModelDraft;
  readonly revision: number;
  readonly latestPublishedVersion?: number;
  readonly publishedRevision?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface PlantSiteSummary extends Omit<PlantSite, 'draft'> {
  readonly nodeCount: number;
  readonly routeCount: number;
}
export interface PlantModelTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly draft: PlantModelDraft;
}
export interface PlantModelVersion {
  readonly number: number;
  readonly revision: number;
  readonly note?: string;
  readonly publishedBy: string;
  readonly publishedAt: string;
}
export interface PlantVersionDiff {
  readonly from: number;
  readonly to: number;
  readonly changes: readonly {
    readonly kind: 'node-type' | 'node' | 'relationship';
    readonly action: 'added' | 'removed' | 'changed';
    readonly id: string;
    readonly name: string;
  }[];
}
export type PlantDashboardRole = 'overview' | 'operations' | 'quality' | 'maintenance' | 'custom';
export interface PlantDashboardAssociation {
  readonly siteId: string;
  readonly dashboardId: string;
  readonly role: PlantDashboardRole;
  readonly displayOrder: number;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export type PlantCatalogLookupResult =
  | { readonly kind: 'scalar'; readonly available: false; readonly resolvedAt: string }
  | {
      readonly kind: 'scalar';
      readonly available: true;
      readonly value: string | number | boolean | null;
      readonly label: string;
      readonly resolvedAt: string;
    }
  | {
      readonly kind: 'choices';
      readonly options: readonly {
        readonly value: string | number | boolean | null;
        readonly label: string;
      }[];
      readonly resolvedAt: string;
    };

export const EMPTY_PLANT_DRAFT: PlantModelDraft = { nodeTypes: [], nodes: [], relationships: [] };

export function plantDraftEqual(left: PlantModelDraft, right: PlantModelDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function publishIssues(
  draft: PlantModelDraft,
): readonly { readonly nodeId?: string; readonly message: string }[] {
  const issues: { nodeId?: string; message: string }[] = [];
  if (draft.nodes.length === 0) issues.push({ message: 'plantModel.validation.empty' });
  const types = new Map(draft.nodeTypes.map((value) => [value.id, value]));
  const routes = draft.relationships.filter((value) => value.kind === 'routes-to');
  for (const node of draft.nodes) {
    const type = types.get(node.nodeTypeId);
    if (type === undefined) {
      issues.push({ nodeId: node.id, message: 'plantModel.validation.type' });
      continue;
    }
    const definitions = [...type.properties, ...node.localProperties];
    for (const definition of definitions) {
      const value = node.values[definition.id];
      if (
        definition.required &&
        definition.type !== 'catalog-scalar' &&
        (value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0))
      ) {
        issues.push({ nodeId: node.id, message: 'plantModel.validation.required' });
      }
    }
    const incoming = routes.some((edge) => edge.targetNodeId === node.id);
    const outgoing = routes.some((edge) => edge.sourceNodeId === node.id);
    if (
      (node.routingRole === 'source' && !outgoing) ||
      (node.routingRole === 'sink' && !incoming) ||
      (node.routingRole === 'intermediate' && (!incoming || !outgoing))
    ) {
      issues.push({ nodeId: node.id, message: 'plantModel.validation.route' });
    }
  }
  return issues;
}
