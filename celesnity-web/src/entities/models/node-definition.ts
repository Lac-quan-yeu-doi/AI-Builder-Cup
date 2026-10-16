export const NODE_CATEGORIES = ['SOURCE', 'TRANSFORM', 'TARGET'] as const;

export type NodeCategory = (typeof NODE_CATEGORIES)[number];

export const NODE_PROPERTY_COMPONENTS = [
  'TEXT_INPUT',
  'MULTI_SELECT',
  'SELECT',
  'RADIO',
  'SQL_EDITOR',
  'KEY_VALUE',
  'FILTER_BUILDER',
  'COLUMN_MAPPING_BUILDER',
  'ORDER_BY_BUILDER',
  'AGGREGATION_BUILDER',
  'TYPED_VALUE',
] as const;

export type NodePropertyComponent = (typeof NODE_PROPERTY_COMPONENTS)[number];

export type NodeRuntimeKind =
  'SPARK_DATAFRAME' | 'SPARK_JDBC_SOURCE' | 'SPARK_ICEBERG_SOURCE' | 'SPARK_ICEBERG_TARGET';

export interface NodeCategoryDefinition {
  readonly type: NodeCategory;
  readonly label: string;
  readonly order: number;
}

export interface NodePort {
  readonly id: string;
  readonly label: string;
  readonly dataType: 'DATASET';
  readonly required: boolean;
  /** `undefined` means the port accepts any number of connections. */
  readonly maxConnections?: number;
}

export interface NodePropertyOption {
  readonly label: string;
  readonly value: string;
  readonly dataType?: string;
  readonly nullable?: boolean;
}

export interface NodePropertyField {
  readonly key: string;
  readonly label: string;
  readonly component: NodePropertyComponent;
  readonly required: boolean;
  readonly description?: string;
  readonly defaultValue?: unknown;
  readonly dependsOn?: readonly string[];
  readonly visibleWhen?: {
    readonly field: string;
    readonly equals: unknown;
  };
  readonly options?: readonly NodePropertyOption[];
}

export interface NodePropertySection {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly NodePropertyField[];
}

export interface NodePropertyPanel {
  readonly sections: readonly NodePropertySection[];
}

/** The saved connection a SOURCE node reads through. */
export interface NodeSourceBinding {
  readonly connectionId: string;
  readonly connectionName: string;
  readonly dbmsType: string;
  readonly verificationStatus: string;
  readonly lastTestedAt?: string;
  readonly lastTestError?: string;
}

/** The managed Iceberg table a TARGET node writes to. */
export interface NodeTargetBinding {
  readonly catalogName: string;
  readonly databaseName: string;
  readonly tableName: string;
  readonly tableType: string;
  readonly storageFormat: 'ICEBERG';
}

/**
 * A palette entry. SOURCE and TARGET definitions share one `type` across every
 * connection and table, so `resourceId` is what identifies the resource a
 * dropped node binds to.
 */
export interface NodeDefinitionSummary {
  readonly resourceId: string;
  readonly type: string;
  readonly category: NodeCategory;
  readonly label: string;
  readonly description: string;
  readonly iconKey: string;
  readonly enabled: boolean;
  readonly runtimeKind: NodeRuntimeKind;
  readonly inputPorts: readonly NodePort[];
  readonly outputPorts: readonly NodePort[];
  readonly source?: NodeSourceBinding;
  readonly target?: NodeTargetBinding;
}

/**
 * The full definition, fetched per node type. The Core API resolves it by type
 * alone, so only `propertyPanel` is trustworthy for a specific dropped node —
 * every resource-bound field must come from the palette summary instead.
 */
export interface NodeDefinition extends NodeDefinitionSummary {
  readonly propertyPanel: NodePropertyPanel;
}

export interface NodePaletteGroup {
  readonly category: NodeCategoryDefinition;
  readonly definitions: readonly NodeDefinitionSummary[];
}

export type NodePalette = readonly NodePaletteGroup[];
