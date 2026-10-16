import type {
  FieldExpression,
  OutputColumn,
  VisualQueryDefinition,
} from '@/src/entities/models/canonical-chart';
import type { CatalogColumnViewModel } from './catalog.presenter';

export type RelationMetadataMap = Readonly<
  Record<string, readonly CatalogColumnViewModel[] | undefined>
>;

export type FieldPickerScope =
  | { readonly kind: 'QUERY_VISIBLE' }
  | { readonly kind: 'JOIN_LEFT'; readonly joinIndex: number }
  | { readonly kind: 'JOIN_RIGHT'; readonly joinIndex: number };

export interface FieldOptionViewModel {
  readonly id: string;
  readonly relation: string;
  readonly name: string;
  readonly label: string;
  readonly dataType: string;
  readonly family: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'UNKNOWN';
}

export interface FieldGroupViewModel {
  readonly id: string;
  readonly relation: string;
  readonly label: string;
  readonly role: 'SOURCE' | 'JOIN' | 'RESULT';
  readonly fields: readonly FieldOptionViewModel[];
}

export function presentFieldGroups(input: {
  readonly query: VisualQueryDefinition;
  readonly relations: RelationMetadataMap;
  readonly scope: FieldPickerScope;
}): readonly FieldGroupViewModel[] {
  const relationIds = relationsForScope(input.query, input.scope);
  return relationIds.flatMap((relation) => {
    const columns = input.relations[relation] ?? [];
    const join = input.query.joins.find((item) => item.alias === relation);
    const tableName = join?.table.table ?? input.query.source.table.table;
    return [
      {
        id: relation,
        relation,
        label: humanize(tableName),
        role: join ? 'JOIN' : 'SOURCE',
        fields: columns.map((column) => presentFieldOption(relation, column)),
      },
    ];
  });
}

export function presentResultFieldGroup(columns: readonly OutputColumn[]): FieldGroupViewModel {
  return {
    id: 'query-result',
    relation: 'result',
    label: 'Query result',
    role: 'RESULT',
    fields: columns.map((column) => ({
      id: `result.${column.name}`,
      relation: 'result',
      name: column.name,
      label: humanize(column.name),
      dataType: column.type,
      family: outputFamily(column.family),
    })),
  };
}

export function fieldExpressionFromOption(option: FieldOptionViewModel): FieldExpression {
  return { kind: 'FIELD', relation: option.relation, field: option.name };
}

function relationsForScope(
  query: VisualQueryDefinition,
  scope: FieldPickerScope,
): readonly string[] {
  const existing = [query.source.alias, ...query.joins.map((join) => join.alias)];
  if (scope.kind === 'JOIN_LEFT') return existing.slice(0, scope.joinIndex + 1);
  if (scope.kind === 'JOIN_RIGHT') {
    const alias = query.joins[scope.joinIndex]?.alias;
    return alias ? [alias] : [];
  }
  return existing;
}

function presentFieldOption(
  relation: string,
  column: CatalogColumnViewModel,
): FieldOptionViewModel {
  return {
    id: `${relation}.${column.name}`,
    relation,
    name: column.name,
    label: humanize(column.name),
    dataType: column.dataType,
    family: dataTypeFamily(column.dataType),
  };
}

function dataTypeFamily(dataType: string): FieldOptionViewModel['family'] {
  const type = dataType.toLowerCase();
  if (/bool/u.test(type)) return 'BOOLEAN';
  if (/(date|time|timestamp)/u.test(type)) return 'DATE';
  if (/(int|decimal|numeric|double|real|float|money|number)/u.test(type)) return 'NUMBER';
  if (/(char|text|string|uuid|json|enum)/u.test(type)) return 'TEXT';
  return 'UNKNOWN';
}

function outputFamily(family: OutputColumn['family']): FieldOptionViewModel['family'] {
  if (family === 'NUMBER') return 'NUMBER';
  if (family === 'BOOLEAN') return 'BOOLEAN';
  if (family === 'DATE' || family === 'TIMESTAMP') return 'DATE';
  if (family === 'STRING') return 'TEXT';
  return 'UNKNOWN';
}

function humanize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .map((word) => {
      if (word.toLowerCase() === 'id') return 'ID';
      if (word.toLowerCase() === 'url') return 'URL';
      if (word.toLowerCase() === 'sql') return 'SQL';
      if (word.toLowerCase() === 'api') return 'API';
      return word ? `${word[0]!.toUpperCase()}${word.slice(1)}` : word;
    })
    .join(' ');
}
