import type { INodeDefinitionReader } from '@application/node-catalog/interfaces/i-node-definition-reader';
import type {
  CatalogSourceBinding,
  ICatalogSourceBindingResolver,
} from '@application/node-catalog/interfaces/i-catalog-source-binding-resolver';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import {
  DEFAULT_DATABASE_SERVICE_LIST_QUERY,
  type DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';
import type { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import { NodeCatalogError } from '@domain/node-catalog/errors/node-catalog.errors';
import type {
  NodeCategory,
  NodeCategoryDefinition,
  NodeDefinition,
  NodeDefinitionSummary,
  NodePortDefinition,
} from '@domain/node-catalog/models/node-definition';
import type { TableSummary } from '@domain/catalog-exploration/models/catalog-models';
import type { PipelineDatasetColumn } from '@domain/pipeline-authoring/models/pipeline';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';

const CATEGORIES: readonly NodeCategoryDefinition[] = [
  { type: 'SOURCE', label: 'Sources', order: 1 },
  { type: 'TRANSFORM', label: 'Transforms', order: 2 },
  { type: 'TARGET', label: 'Targets', order: 3 },
];

export interface ListNodeDefinitionsQuery {
  readonly category?: NodeCategory;
  readonly keyword?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy: 'label' | 'type';
  readonly sortDirection: 'ASC' | 'DESC';
}

export interface NodeDefinitionPage {
  readonly items: readonly NodeDefinitionSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export class NodeCatalogUseCases {
  public constructor(
    private readonly reader: INodeDefinitionReader,
    private readonly connections: IDatabaseServiceReader,
    private readonly catalogs: CatalogExplorationUseCases,
    private readonly catalogSources: ICatalogSourceBindingResolver,
  ) {}

  public listCategories(): readonly NodeCategoryDefinition[] {
    return CATEGORIES;
  }

  public async listDefinitions(query: ListNodeDefinitionsQuery): Promise<NodeDefinitionPage> {
    const keyword = query.keyword?.trim().toLowerCase() ?? '';
    const start = (query.page - 1) * query.pageSize;
    const filter = { category: query.category, keyword: keyword === '' ? undefined : keyword };

    if (query.category === 'TRANSFORM') {
      return this.listPersistedTransforms(query, filter, start);
    }

    const definitions = await this.dynamicDefinitions(query.category);
    const filtered = definitions
      .filter((definition) => matchesKeyword(definition, filter.keyword))
      .sort(definitionComparator(query.sortBy, query.sortDirection));
    const totalItems = filtered.length;

    return {
      items: filtered.slice(start, start + query.pageSize).map(toSummary),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
    };
  }

  private async listPersistedTransforms(
    query: ListNodeDefinitionsQuery,
    filter: { readonly category?: NodeCategory; readonly keyword?: string },
    start: number,
  ): Promise<NodeDefinitionPage> {
    const [definitions, totalItems] = await Promise.all([
      this.reader.list({
        ...filter,
        skip: start,
        take: query.pageSize,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      }),
      this.reader.count(filter),
    ]);

    return {
      items: definitions.map(toSummary),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
    };
  }

  public async getDefinition(type: string): Promise<NodeDefinition> {
    const normalizedType = type.trim().toUpperCase();
    const persisted = await this.reader.findByType(normalizedType);
    const definition =
      persisted ??
      (await this.sourceDefinitions()).find((candidate) => candidate.type === normalizedType) ??
      this.targetDefinitions().find((candidate) => candidate.type === normalizedType);
    if (definition === undefined) {
      throw NodeCatalogError.notFound();
    }
    if (!definition.enabled) {
      throw NodeCatalogError.disabled();
    }
    return definition;
  }

  public async resolveDefinition(
    type: string,
    resourceId?: string,
  ): Promise<NodeDefinition | undefined> {
    const normalizedType = type.trim().toUpperCase();
    if (resourceId?.startsWith('connection:') === true) {
      const connection = await this.connections.findActiveById(
        resourceId.slice('connection:'.length),
      );
      if (connection === undefined) {
        return undefined;
      }
      const definition = toSourceDefinition(connection);
      return definition.enabled && definition.type === normalizedType ? definition : undefined;
    }
    if (resourceId?.startsWith('iceberg-source:') === true) {
      if (normalizedType !== 'ICEBERG_SOURCE') return undefined;
      return this.sourceDefinitions().then((definitions) =>
        definitions.find((definition) => definition.resourceId === resourceId),
      );
    }
    if (resourceId?.startsWith('iceberg:') === true) {
      if (normalizedType !== 'ICEBERG_TARGET') {
        return undefined;
      }
      const generic = this.targetDefinitions()[0];
      if (generic?.resourceId === resourceId) {
        return generic;
      }
      return this.resolveLegacyTarget(resourceId);
    }
    const definition = await this.reader.findByType(normalizedType);
    return definition?.enabled === true ? definition : undefined;
  }

  private async dynamicDefinitions(category?: NodeCategory): Promise<readonly NodeDefinition[]> {
    if (category === 'SOURCE') {
      return this.sourceDefinitions();
    }
    if (category === 'TARGET') {
      return this.targetDefinitions();
    }

    const persistedCount = await this.reader.count({});
    const [sources, transforms] = await Promise.all([
      this.sourceDefinitions(),
      this.reader.list({
        skip: 0,
        take: persistedCount,
        sortBy: 'label',
        sortDirection: 'ASC',
      }),
    ]);
    const targets = this.targetDefinitions();
    return [...sources, ...transforms, ...targets];
  }

  private async sourceDefinitions(): Promise<readonly NodeDefinition[]> {
    const databaseServices = (
      await this.connections.listActive(DEFAULT_DATABASE_SERVICE_LIST_QUERY)
    ).items.map(toSourceDefinition);
    const catalog = this.catalogs.listCatalogs()[0];
    return catalog === undefined
      ? databaseServices
      : [...databaseServices, toCatalogSourceDefinition(catalog.name)];
  }

  private targetDefinitions(): readonly NodeDefinition[] {
    const catalog = this.catalogs.listCatalogs()[0];
    return catalog === undefined ? [] : [toTargetDefinition(catalog.name)];
  }

  public async isWritableTarget(databaseName: string, tableName: string): Promise<boolean> {
    const catalog = this.catalogs.listCatalogs()[0];
    if (catalog === undefined) {
      return false;
    }
    const tables = await this.catalogs.listWritableTables(catalog.name, databaseName);
    return tables.some((table) => table.name === tableName);
  }

  public async isWritableDatabase(databaseName: string): Promise<boolean> {
    const catalog = this.catalogs.listCatalogs()[0];
    if (catalog === undefined) {
      return false;
    }
    const databases = await this.catalogs.listWritableSchemas(catalog.name);
    return databases.some((database) => database.name === databaseName);
  }

  public async resolveCatalogSource(
    databaseServiceId: string,
    namespaceId: string,
    relationId: string,
  ): Promise<CatalogSourceBinding | undefined> {
    return this.catalogSources.resolve(databaseServiceId, namespaceId, relationId);
  }

  public async resolveSourceColumns(
    definition: NodeDefinition,
    config: Readonly<Record<string, unknown>>,
  ): Promise<readonly PipelineDatasetColumn[] | undefined> {
    if (definition.type === 'ICEBERG_SOURCE' || config.sourceMode === 'ICEBERG_CATALOG') {
      const databaseName = nonEmptyText(config.catalogDatabaseName);
      const tableName = nonEmptyText(config.catalogTableName);
      const catalog = this.catalogs.listCatalogs()[0];
      if (catalog === undefined || databaseName === undefined || tableName === undefined) {
        return undefined;
      }
      return (await this.catalogs.listColumns(catalog.name, databaseName, tableName)).columns.map(
        (column) => ({
          name: column.name,
          dataType: column.dataType,
          nullable: column.nullable,
        }),
      );
    }
    if (definition.type !== 'POSTGRES_SOURCE') return undefined;
    const databaseServiceId = definition.source?.connectionId;
    const namespaceId = nonEmptyText(config.catalogNamespaceId);
    const relationId = nonEmptyText(config.catalogRelationId);
    if (databaseServiceId === undefined || namespaceId === undefined || relationId === undefined) {
      return undefined;
    }
    return (await this.catalogSources.resolve(databaseServiceId, namespaceId, relationId))?.columns;
  }

  public async resolveTargetColumns(
    config: Readonly<Record<string, unknown>>,
    definition?: NodeDefinition,
  ): Promise<readonly PipelineDatasetColumn[] | undefined> {
    if (config.tableMode === 'CREATE_NEW') return undefined;
    const databaseName = nonEmptyText(config.databaseName) ?? definition?.target?.databaseName;
    const tableName = nonEmptyText(config.tableName) ?? definition?.target?.tableName;
    const catalog = this.catalogs.listCatalogs()[0];
    if (catalog === undefined || databaseName === undefined || tableName === undefined) {
      return undefined;
    }
    return (await this.catalogs.listColumns(catalog.name, databaseName, tableName)).columns.map(
      (column) => ({
        name: column.name,
        dataType: column.dataType,
        nullable: column.nullable,
      }),
    );
  }

  private async resolveLegacyTarget(resourceId: string): Promise<NodeDefinition | undefined> {
    const catalog = this.catalogs.listCatalogs()[0];
    if (catalog === undefined) {
      return undefined;
    }
    const parts = resourceId.slice('iceberg:'.length).split('.');
    if (parts.length !== 3 || parts[0] !== catalog.name) {
      return undefined;
    }
    const [catalogName, databaseName, tableName] = parts as [string, string, string];
    const table = (await this.catalogs.listWritableTables(catalogName, databaseName)).find(
      (candidate) => candidate.name === tableName,
    );
    return table === undefined ? undefined : toLegacyTargetDefinition(table);
  }
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function toSummary(definition: NodeDefinition): NodeDefinitionSummary {
  return {
    resourceId: definition.resourceId,
    type: definition.type,
    category: definition.category,
    label: definition.label,
    description: definition.description,
    iconKey: definition.iconKey,
    enabled: definition.enabled,
    runtimeKind: definition.runtimeKind,
    inputPorts: definition.inputPorts,
    outputPorts: definition.outputPorts,
    ...(definition.source === undefined ? {} : { source: definition.source }),
    ...(definition.target === undefined ? {} : { target: definition.target }),
  };
}

const DATASET_INPUT: NodePortDefinition = {
  id: 'input',
  label: 'Input',
  dataType: 'DATASET',
  required: true,
  maxConnections: 1,
};

const DATASET_OUTPUT: NodePortDefinition = {
  id: 'output',
  label: 'Output',
  dataType: 'DATASET',
  required: false,
  maxConnections: null,
};

function toSourceDefinition(connection: DatabaseServiceView): NodeDefinition {
  const enabled = connection.verificationStatus === VerificationStatusValue.SUCCEEDED;
  return {
    resourceId: `connection:${connection.id}`,
    type:
      connection.connectorType === 'POSTGRESQL'
        ? 'POSTGRES_SOURCE'
        : `${connection.connectorType}_SOURCE`,
    category: 'SOURCE',
    label: connection.name,
    description: `Read data through the saved ${connection.connectorType} connection.`,
    iconKey: connection.connectorType.toLowerCase(),
    enabled,
    runtimeKind: 'SPARK_JDBC_SOURCE',
    inputPorts: [],
    outputPorts: [DATASET_OUTPUT],
    propertyPanel: {
      sections: [
        {
          id: 'source',
          title: 'Source table',
          fields: [
            {
              key: 'catalogNamespaceId',
              label: 'Database schema',
              component: 'SELECT',
              required: true,
            },
            {
              key: 'catalogRelationId',
              label: 'Database table',
              component: 'SELECT',
              required: true,
              dependsOn: ['catalogNamespaceId'],
            },
          ],
        },
      ],
    },
    source: {
      connectionId: connection.id,
      connectionName: connection.name,
      dbmsType: connection.connectorType,
      configSchemaVersion: connection.configSchemaVersion,
      config: connection.config,
      verificationStatus: connection.verificationStatus,
      ...(connection.lastTestedAt === undefined ? {} : { lastTestedAt: connection.lastTestedAt }),
      ...(connection.lastTestError === undefined
        ? {}
        : { lastTestError: connection.lastTestError }),
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    },
  };
}

function toCatalogSourceDefinition(catalogName: string): NodeDefinition {
  return {
    resourceId: `iceberg-source:${catalogName}`,
    type: 'ICEBERG_SOURCE',
    category: 'SOURCE',
    label: 'Data Catalog',
    description: 'Read an existing managed Iceberg table from the data catalog.',
    iconKey: 'iceberg',
    enabled: true,
    runtimeKind: 'SPARK_ICEBERG_SOURCE',
    inputPorts: [],
    outputPorts: [DATASET_OUTPUT],
    propertyPanel: {
      sections: [
        {
          id: 'source',
          title: 'Catalog table',
          fields: [
            {
              key: 'catalogDatabaseName',
              label: 'Catalog database',
              component: 'SELECT',
              required: true,
            },
            {
              key: 'catalogTableName',
              label: 'Catalog table',
              component: 'SELECT',
              required: true,
              dependsOn: ['catalogDatabaseName'],
            },
          ],
        },
      ],
    },
  };
}

function toTargetDefinition(catalogName: string): NodeDefinition {
  return {
    resourceId: `iceberg:${catalogName}`,
    type: 'ICEBERG_TARGET',
    category: 'TARGET',
    label: 'Iceberg table',
    description: 'Choose a managed database and table for the transformed dataset.',
    iconKey: 'iceberg',
    enabled: true,
    runtimeKind: 'SPARK_ICEBERG_TARGET',
    inputPorts: [DATASET_INPUT],
    outputPorts: [],
    propertyPanel: {
      sections: [
        {
          id: 'target',
          title: 'Iceberg destination',
          fields: [
            {
              key: 'databaseName',
              label: 'Database',
              component: 'SELECT',
              required: true,
            },
            {
              key: 'tableMode',
              label: 'Table option',
              component: 'SELECT',
              required: true,
              defaultValue: 'EXISTING',
              options: [
                { label: 'Select existing table', value: 'EXISTING' },
                { label: 'Create new table', value: 'CREATE_NEW' },
              ],
            },
            {
              key: 'tableName',
              label: 'Existing table',
              component: 'SELECT',
              required: true,
              dependsOn: ['databaseName'],
              visibleWhen: { field: 'tableMode', equals: 'EXISTING' },
            },
            {
              key: 'newTableName',
              label: 'New table name',
              component: 'TEXT_INPUT',
              required: true,
              dependsOn: ['databaseName'],
              visibleWhen: { field: 'tableMode', equals: 'CREATE_NEW' },
              description: 'Use letters, numbers, and underscores only.',
            },
            {
              key: 'writeMode',
              label: 'Write mode',
              component: 'SELECT',
              required: true,
              defaultValue: 'APPEND',
              visibleWhen: { field: 'tableMode', equals: 'EXISTING' },
              options: [
                { label: 'Append', value: 'APPEND' },
                { label: 'Overwrite data and schema', value: 'OVERWRITE' },
              ],
            },
          ],
        },
      ],
    },
  };
}

function toLegacyTargetDefinition(table: TableSummary): NodeDefinition {
  return {
    ...toTargetDefinition(table.catalog),
    resourceId: `iceberg:${table.catalog}.${table.schema}.${table.name}`,
    label: `${table.schema}.${table.name}`,
    propertyPanel: {
      sections: [
        {
          id: 'target',
          title: 'Iceberg destination',
          fields: [
            {
              key: 'writeMode',
              label: 'Write mode',
              component: 'SELECT',
              required: true,
              defaultValue: 'APPEND',
              options: [
                { label: 'Append', value: 'APPEND' },
                { label: 'Overwrite data and schema', value: 'OVERWRITE' },
              ],
            },
          ],
        },
      ],
    },
    target: {
      catalogName: table.catalog,
      databaseName: table.schema,
      tableName: table.name,
      tableType: table.tableType,
      storageFormat: 'ICEBERG',
    },
  };
}

function matchesKeyword(definition: NodeDefinition, keyword?: string): boolean {
  return (
    keyword === undefined ||
    [definition.type, definition.label, definition.description, definition.resourceId].some(
      (value) => value.toLowerCase().includes(keyword),
    )
  );
}

function definitionComparator(
  sortBy: 'label' | 'type',
  sortDirection: 'ASC' | 'DESC',
): (left: NodeDefinition, right: NodeDefinition) => number {
  const direction = sortDirection === 'ASC' ? 1 : -1;
  return (left, right) => left[sortBy].localeCompare(right[sortBy]) * direction;
}
