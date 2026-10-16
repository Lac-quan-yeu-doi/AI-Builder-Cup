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
export type PlantRelationshipKind = 'contains' | 'routes-to';
export type PlantScalar = string | number | boolean | null;
export type PlantPropertyValue = PlantScalar | readonly string[];

export interface PlantValueSetOption {
  readonly id: string;
  readonly label: string;
  readonly deprecated?: boolean;
}

export interface PlantCatalogFilter {
  readonly column: string;
  readonly operator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
  readonly operand:
    | { readonly kind: 'literal'; readonly value: PlantScalar }
    | { readonly kind: 'property'; readonly propertyDefinitionId: string };
}

export interface PlantCatalogBinding {
  readonly mode: 'scalar' | 'choices';
  readonly catalog: string;
  readonly schema: string;
  readonly table: string;
  readonly valueColumn: string;
  readonly labelColumn?: string;
  readonly filters: readonly PlantCatalogFilter[];
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
  readonly kind: PlantRelationshipKind;
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

export interface PlantModelVersion {
  readonly number: number;
  readonly revision: number;
  readonly note?: string;
  readonly publishedBy: string;
  readonly publishedAt: string;
}

export interface PlantModelVersionSnapshot extends PlantModelVersion {
  readonly id: string;
  readonly draft: PlantModelDraft;
}

export interface PlantModelTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly draft: PlantModelDraft;
}

export interface PlantReferenceData {
  readonly shiftCalendar: Readonly<Record<string, unknown>>;
  readonly downtimeReasons: readonly Readonly<Record<string, unknown>>[];
  readonly defectCodes: readonly Readonly<Record<string, unknown>>[];
}

export interface PlantVersionChange {
  readonly kind: 'node-type' | 'node' | 'relationship';
  readonly action: 'added' | 'removed' | 'changed';
  readonly id: string;
  readonly name: string;
}

export interface PlantVersionDiff {
  readonly from: number;
  readonly to: number;
  readonly changes: readonly PlantVersionChange[];
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

export const EMPTY_PLANT_MODEL: PlantModelDraft = Object.freeze({
  nodeTypes: Object.freeze([]),
  nodes: Object.freeze([]),
  relationships: Object.freeze([]),
});
