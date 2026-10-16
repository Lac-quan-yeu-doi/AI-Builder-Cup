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

export interface NodeCategoryDefinition {
  readonly type: NodeCategory;
  readonly label: string;
  readonly order: number;
}

export interface NodePortDefinition {
  readonly id: string;
  readonly label: string;
  readonly dataType: 'DATASET';
  readonly required: boolean;
  readonly maxConnections: number | null;
}

export interface NodePropertyOption {
  readonly label: string;
  readonly value: string;
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

export interface NodeDefinition {
  readonly resourceId: string;
  readonly type: string;
  readonly category: NodeCategory;
  readonly label: string;
  readonly description: string;
  readonly iconKey: string;
  readonly enabled: boolean;
  readonly runtimeKind:
    'SPARK_DATAFRAME' | 'SPARK_JDBC_SOURCE' | 'SPARK_ICEBERG_SOURCE' | 'SPARK_ICEBERG_TARGET';
  readonly inputPorts: readonly NodePortDefinition[];
  readonly outputPorts: readonly NodePortDefinition[];
  readonly propertyPanel: {
    readonly sections: readonly NodePropertySection[];
  };
  readonly source?: NodeSourceBinding;
  readonly target?: NodeTargetBinding;
}

export interface NodeSourceBinding {
  readonly connectionId: string;
  readonly connectionName: string;
  readonly dbmsType: string;
  readonly configSchemaVersion: number;
  readonly config: Readonly<Record<string, unknown>>;
  readonly verificationStatus: string;
  readonly lastTestedAt?: string;
  readonly lastTestError?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NodeTargetBinding {
  readonly catalogName: string;
  readonly databaseName: string;
  readonly tableName: string;
  readonly tableType: string;
  readonly storageFormat: 'ICEBERG';
}

export type NodeDefinitionSummary = Omit<NodeDefinition, 'propertyPanel'>;
