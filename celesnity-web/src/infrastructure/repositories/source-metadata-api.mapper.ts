import type {
  SourceColumn,
  SourceConstraint,
  SourceMetadataPage,
  SourceMetadataSnapshotSummary,
  SourceNamespace,
  SourceRelation,
} from '@/src/entities/models/source-metadata';

export type SourceMetadataResponseDto = Record<string, unknown>;

export function fromSourceMetadataSummary(
  dto: SourceMetadataResponseDto,
): SourceMetadataSnapshotSummary {
  return {
    hasSnapshot: boolean(dto.hasSnapshot, 'hasSnapshot'),
    databaseCount: nonNegativeInteger(dto.databaseCount, 'databaseCount'),
    schemaCount: nonNegativeInteger(dto.schemaCount, 'schemaCount'),
    relationCount: nonNegativeInteger(dto.relationCount, 'relationCount'),
    columnCount: nonNegativeInteger(dto.columnCount, 'columnCount'),
    constraintCount: nonNegativeInteger(dto.constraintCount, 'constraintCount'),
    ...(dto.lastCrawledAt === undefined
      ? {}
      : { lastCrawledAt: string(dto.lastCrawledAt, 'lastCrawledAt') }),
  };
}

export function fromSourceNamespacePage(
  dto: SourceMetadataResponseDto,
): SourceMetadataPage<SourceNamespace> {
  return fromPage(dto, fromSourceNamespace, ['name', 'relationCount', 'lastCrawledAt']);
}

export function fromSourceRelationPage(
  dto: SourceMetadataResponseDto,
): SourceMetadataPage<SourceRelation> {
  return fromPage(dto, fromSourceRelation, [
    'name',
    'relationType',
    'columnCount',
    'lastCrawledAt',
  ]);
}

export function fromSourceColumnPage(
  dto: SourceMetadataResponseDto,
): SourceMetadataPage<SourceColumn> {
  return fromPage(dto, fromSourceColumn, ['ordinalPosition', 'name', 'nativeType', 'nullable']);
}

export function fromSourceRelation(dto: SourceMetadataResponseDto): SourceRelation {
  return {
    id: string(dto.id, 'id'),
    namespaceId: string(dto.namespaceId, 'namespaceId'),
    name: string(dto.name, 'name'),
    relationType: string(dto.relationType, 'relationType'),
    ...(dto.description === undefined
      ? {}
      : { description: string(dto.description, 'description') }),
    columnCount: nonNegativeInteger(dto.columnCount, 'columnCount'),
    ...(dto.ddl === undefined ? {} : { ddl: string(dto.ddl, 'ddl') }),
    properties: properties(dto.properties),
    ...(dto.lastCrawledAt === undefined
      ? {}
      : { lastCrawledAt: string(dto.lastCrawledAt, 'lastCrawledAt') }),
  };
}

export function fromSourceConstraints(value: unknown): readonly SourceConstraint[] {
  if (!Array.isArray(value)) throw new Error('The Core API returned invalid source constraints.');
  return value.map((item, index) => fromSourceConstraint(record(item, `constraints[${index}]`)));
}

function fromSourceNamespace(dto: SourceMetadataResponseDto): SourceNamespace {
  return {
    id: string(dto.id, 'id'),
    name: string(dto.name, 'name'),
    type: string(dto.type, 'type'),
    ...(dto.description === undefined
      ? {}
      : { description: string(dto.description, 'description') }),
    relationCount: nonNegativeInteger(dto.relationCount, 'relationCount'),
    ...(dto.lastCrawledAt === undefined
      ? {}
      : { lastCrawledAt: string(dto.lastCrawledAt, 'lastCrawledAt') }),
  };
}

function fromSourceColumn(dto: SourceMetadataResponseDto): SourceColumn {
  return {
    id: string(dto.id, 'id'),
    relationId: string(dto.relationId, 'relationId'),
    name: string(dto.name, 'name'),
    ordinalPosition: nonNegativeInteger(dto.ordinalPosition, 'ordinalPosition'),
    nativeType: string(dto.nativeType, 'nativeType'),
    canonicalType: string(dto.canonicalType, 'canonicalType'),
    nullable: boolean(dto.nullable, 'nullable'),
    ...(dto.defaultValue === undefined
      ? {}
      : { defaultValue: string(dto.defaultValue, 'defaultValue') }),
    ...(dto.description === undefined
      ? {}
      : { description: string(dto.description, 'description') }),
    properties: properties(dto.properties),
  };
}

function fromSourceConstraint(dto: SourceMetadataResponseDto): SourceConstraint {
  const columns = dto.columns;
  if (!Array.isArray(columns)) throw new Error('The Core API returned invalid constraint columns.');
  return {
    id: string(dto.id, 'id'),
    name: string(dto.name, 'name'),
    constraintType: string(dto.constraintType, 'constraintType'),
    columns: columns.map((item, index) => {
      const column = record(item, `columns[${index}]`);
      return {
        name: string(column.name, `columns[${index}].name`),
        position: nonNegativeInteger(column.position, `columns[${index}].position`),
        ...(column.referencedColumnName === undefined
          ? {}
          : {
              referencedColumnName: string(
                column.referencedColumnName,
                `columns[${index}].referencedColumnName`,
              ),
            }),
      };
    }),
    ...(dto.referencedRelationPath === undefined
      ? {}
      : { referencedRelationPath: string(dto.referencedRelationPath, 'referencedRelationPath') }),
    ...(dto.checkExpression === undefined
      ? {}
      : { checkExpression: string(dto.checkExpression, 'checkExpression') }),
    properties: properties(dto.properties),
  };
}

function fromPage<T>(
  dto: SourceMetadataResponseDto,
  itemMapper: (item: SourceMetadataResponseDto) => T,
  fields: readonly string[],
): SourceMetadataPage<T> {
  if (!Array.isArray(dto.items))
    throw new Error('The Core API returned invalid source metadata items.');
  const pagination = record(dto.pagination, 'pagination');
  const sort = record(dto.sort, 'sort');
  const sortField = string(sort.field, 'sort.field');
  if (!fields.includes(sortField))
    throw new Error('The Core API returned an invalid source metadata sort field.');
  const direction = sortDirection(sort.direction, 'sort.direction');
  return {
    items: dto.items.map((item, index) => itemMapper(record(item, `items[${index}]`))),
    pagination: {
      page: positiveInteger(pagination.page, 'pagination.page'),
      pageSize: pageSize(pagination.pageSize),
      total: nonNegativeInteger(pagination.total, 'pagination.total'),
      totalPages: nonNegativeInteger(pagination.totalPages, 'pagination.totalPages'),
    },
    sort: { field: sortField, direction },
  };
}

function record(value: unknown, field: string): SourceMetadataResponseDto {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The Core API returned an invalid source metadata ${field}.`);
  }
  return value as SourceMetadataResponseDto;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`The Core API returned an invalid source metadata ${field}.`);
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`The Core API returned an invalid source metadata ${field}.`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`The Core API returned an invalid source metadata ${field}.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`The Core API returned an invalid source metadata ${field}.`);
  }
  return value;
}

function pageSize(value: unknown): number {
  const result = positiveInteger(value, 'pagination.pageSize');
  if (result > 200) throw new Error('The Core API returned an invalid source metadata page size.');
  return result;
}

function sortDirection(value: unknown, field: string): 'asc' | 'desc' {
  if (value !== 'asc' && value !== 'desc')
    throw new Error(`The Core API returned an invalid ${field}.`);
  return value;
}

function properties(value: unknown): Readonly<Record<string, unknown>> {
  return record(value, 'properties');
}
