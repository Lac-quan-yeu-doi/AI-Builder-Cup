import type { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';
import type {
  PipelineDatasetColumn,
  PipelineGraph,
  PipelineNode,
  PipelineNodeSchema,
  PipelineValidationIssue,
} from '@domain/pipeline-authoring/models/pipeline';
import { CatalogAccessDeniedError } from '@application/catalog-exploration/catalog-access-authorizer';

interface SchemaValidationResult {
  readonly errors: readonly PipelineValidationIssue[];
  readonly warnings: readonly PipelineValidationIssue[];
  readonly nodeSchemas: Readonly<Record<string, PipelineNodeSchema>>;
}

const KNOWN = (columns: readonly PipelineDatasetColumn[]): PipelineNodeSchema => ({
  status: 'KNOWN',
  columns: columns.map(normalizeColumn),
});
const UNAVAILABLE: PipelineNodeSchema = { status: 'UNAVAILABLE', columns: [] };
const RUNTIME_DEPENDENT: PipelineNodeSchema = { status: 'RUNTIME_DEPENDENT', columns: [] };
const NUMERIC_TYPES = new Set(['byte', 'short', 'int', 'long', 'float', 'double', 'decimal']);
const ORDERED_TYPES = new Set([...NUMERIC_TYPES, 'date', 'timestamp', 'string']);

export class PipelineSchemaValidator {
  public constructor(private readonly nodeCatalog: NodeCatalogUseCases) {}

  public async validate(
    graph: PipelineGraph,
    definitions: ReadonlyMap<string, NodeDefinition>,
  ): Promise<SchemaValidationResult> {
    if (
      typeof (this.nodeCatalog as unknown as { resolveSourceColumns?: unknown })
        .resolveSourceColumns !== 'function'
    ) {
      return { errors: [], warnings: [], nodeSchemas: {} };
    }
    const errors: PipelineValidationIssue[] = [];
    const warnings: PipelineValidationIssue[] = [];
    const schemas = new Map<string, PipelineNodeSchema>();
    for (const node of topologicalNodes(graph)) {
      const definition = definitions.get(node.id);
      if (definition === undefined) continue;
      if (definition.category === 'SOURCE') {
        try {
          const columns = await this.nodeCatalog.resolveSourceColumns(definition, node.config);
          if (columns === undefined) {
            schemas.set(node.id, UNAVAILABLE);
            const target = sourceHasMetadataBinding(node, definition) ? errors : warnings;
            target.push(
              issue(
                'SOURCE_SCHEMA_UNAVAILABLE',
                'Column metadata is unavailable. Run the metadata crawler or refresh the catalog before configuring field-aware transformations.',
                node.id,
              ),
            );
          } else if (columns.length === 0) {
            schemas.set(node.id, UNAVAILABLE);
            errors.push(
              issue(
                'SOURCE_SCHEMA_EMPTY',
                'The selected source has no current columns and cannot produce a writable dataset.',
                node.id,
              ),
            );
          } else {
            schemas.set(node.id, KNOWN(columns));
          }
        } catch (error: unknown) {
          schemas.set(node.id, UNAVAILABLE);
          if (error instanceof CatalogAccessDeniedError) {
            errors.push(
              issue(
                'SOURCE_ACCESS_DENIED',
                'The execution principal is not permitted to describe the selected source.',
                node.id,
              ),
            );
            continue;
          }
          errors.push(
            issue(
              'SOURCE_SCHEMA_UNAVAILABLE',
              'The source schema could not be loaded. Retry after the metadata service is available.',
              node.id,
            ),
          );
        }
        continue;
      }

      const input = inputSchema(graph, node.id, schemas);
      if (definition.category === 'TARGET') {
        schemas.set(node.id, input);
        if (definition.type === 'ICEBERG_TARGET') {
          await this.validateTarget(node, definition, input, errors, warnings);
        }
        continue;
      }
      const transformed = transformSchema(node, input, errors, warnings);
      schemas.set(node.id, transformed);
    }
    return { errors, warnings, nodeSchemas: Object.fromEntries(schemas) };
  }

  private async validateTarget(
    node: PipelineNode,
    definition: NodeDefinition,
    input: PipelineNodeSchema,
    errors: PipelineValidationIssue[],
    warnings: PipelineValidationIssue[],
  ): Promise<void> {
    if (input.status === 'RUNTIME_DEPENDENT') {
      const writeMode = text(node.config.writeMode) ?? 'APPEND';
      if (node.config.tableMode !== 'CREATE_NEW' && writeMode === 'APPEND') {
        errors.push(
          issue(
            'OUTPUT_SCHEMA_UNRESOLVED',
            'Append requires a deterministic output schema. Resolve or remove the runtime-dependent transformation first.',
            node.id,
          ),
        );
      } else {
        warnings.push(
          issue(
            'OUTPUT_SCHEMA_RUNTIME_DEPENDENT',
            'The output schema depends on runtime data and will be checked again before writing.',
            node.id,
          ),
        );
      }
      return;
    }
    if (input.status !== 'KNOWN') return;
    const duplicate = duplicates(input.columns.map((column) => column.name));
    if (input.columns.length === 0 || duplicate.length > 0) {
      errors.push(
        issue(
          'OUTPUT_SCHEMA_INVALID',
          duplicate.length > 0
            ? `Output field names must be unique: ${duplicate.join(', ')}.`
            : 'A target requires at least one output field.',
          node.id,
        ),
      );
      return;
    }
    if (node.config.tableMode === 'CREATE_NEW') return;
    let target: readonly PipelineDatasetColumn[] | undefined;
    try {
      target = await this.nodeCatalog.resolveTargetColumns(node.config, definition);
    } catch {
      errors.push(
        issue(
          'TARGET_SCHEMA_UNAVAILABLE',
          'The target schema could not be loaded. Retry after the catalog service is available.',
          node.id,
        ),
      );
      return;
    }
    if (target === undefined || target.length === 0) {
      errors.push(
        issue(
          'TARGET_SCHEMA_UNAVAILABLE',
          'The existing target schema is unavailable. Refresh the catalog or select another target before saving.',
          node.id,
          'tableName',
        ),
      );
      return;
    }
    const writeMode = text(node.config.writeMode) ?? 'APPEND';
    const mismatch = schemaMismatch(input.columns, target);
    if (writeMode === 'OVERWRITE') {
      if (mismatch.length > 0) {
        warnings.push(
          issue(
            'TARGET_SCHEMA_WILL_CHANGE',
            `Overwrite will replace the target schema: ${mismatch.join(' ')}`,
            node.id,
            'writeMode',
          ),
        );
      }
      return;
    }
    if (mismatch.length > 0) {
      errors.push(
        issue(
          'TARGET_SCHEMA_MISMATCH',
          `Append output is incompatible with the target: ${mismatch.join(' ')}`,
          node.id,
          'tableName',
        ),
      );
    }
  }
}

function sourceHasMetadataBinding(node: PipelineNode, definition: NodeDefinition): boolean {
  return (
    definition.type === 'ICEBERG_SOURCE' ||
    node.config.sourceMode === 'ICEBERG_CATALOG' ||
    (text(node.config.catalogNamespaceId) !== undefined &&
      text(node.config.catalogRelationId) !== undefined)
  );
}

function transformSchema(
  node: PipelineNode,
  input: PipelineNodeSchema,
  errors: PipelineValidationIssue[],
  warnings: PipelineValidationIssue[],
): PipelineNodeSchema {
  if (input.status !== 'KNOWN') return input;
  const columns = input.columns;
  const names = new Set(columns.map((column) => column.name));
  const requireFields = (field: string, values: readonly string[]): boolean => {
    const missing = values.filter((value) => !names.has(value));
    const repeated = duplicates(values);
    if (missing.length > 0) {
      errors.push(
        issue(
          'TRANSFORM_FIELD_NOT_FOUND',
          `These fields are not produced by the upstream node: ${missing.join(', ')}.`,
          node.id,
          field,
        ),
      );
    }
    if (repeated.length > 0) {
      errors.push(
        issue(
          'TRANSFORM_FIELD_DUPLICATED',
          `Each field may be selected only once: ${repeated.join(', ')}.`,
          node.id,
          field,
        ),
      );
    }
    return missing.length === 0 && repeated.length === 0;
  };

  switch (node.definitionType) {
    case 'SELECT_FIELDS': {
      const fields = strings(node.config.fields);
      if (!requireFields('fields', fields)) return KNOWN(columns);
      return KNOWN(fields.map((field) => columns.find((column) => column.name === field)!));
    }
    case 'DROP_FIELDS': {
      const fields = strings(node.config.fields);
      if (!requireFields('fields', fields)) return KNOWN(columns);
      const remaining = columns.filter((column) => !fields.includes(column.name));
      if (remaining.length === 0) {
        errors.push(
          issue(
            'OUTPUT_SCHEMA_INVALID',
            'Dropping every field would leave no writable output.',
            node.id,
            'fields',
          ),
        );
      }
      return KNOWN(remaining);
    }
    case 'RENAME_FIELD': {
      const source = text(node.config.sourceField);
      const target = text(node.config.targetField);
      if (source === undefined || target === undefined || !requireFields('sourceField', [source])) {
        return KNOWN(columns);
      }
      if (source !== target && names.has(target)) {
        errors.push(
          issue(
            'DUPLICATE_OUTPUT_FIELD',
            `The output field ${target} already exists.`,
            node.id,
            'targetField',
          ),
        );
        return KNOWN(columns);
      }
      return KNOWN(
        columns.map((column) => (column.name === source ? { ...column, name: target } : column)),
      );
    }
    case 'CHANGE_SCHEMA': {
      const mappings = records(node.config.mappings);
      const sourceFields = mappings.map((mapping) => text(mapping.sourceField)).filter(isString);
      const targetFields = mappings.map((mapping) => text(mapping.targetField)).filter(isString);
      requireFields('mappings', sourceFields);
      const repeatedTargets = duplicates(targetFields);
      if (repeatedTargets.length > 0) {
        errors.push(
          issue(
            'DUPLICATE_OUTPUT_FIELD',
            `Output fields must be unique: ${repeatedTargets.join(', ')}.`,
            node.id,
            'mappings',
          ),
        );
      }
      const result = mappings.flatMap((mapping) => {
        const source = text(mapping.sourceField);
        const target = text(mapping.targetField);
        const targetType = text(mapping.targetType);
        const original = columns.find((column) => column.name === source);
        return original === undefined || target === undefined || targetType === undefined
          ? []
          : [{ name: target, dataType: normalizeType(targetType), nullable: true }];
      });
      return result.length === mappings.length && repeatedTargets.length === 0
        ? KNOWN(result)
        : KNOWN(columns);
    }
    case 'FILTER': {
      const conditions = records(node.config.conditions);
      for (const condition of conditions) {
        const field = text(condition.key);
        if (field === undefined || !requireFields('conditions', [field])) continue;
        const column = columns.find((candidate) => candidate.name === field)!;
        const operator = text(condition.operator);
        if (
          operator !== undefined &&
          ['CONTAINS', 'STARTS_WITH', 'ENDS_WITH'].includes(operator) &&
          baseType(column.dataType) !== 'string'
        ) {
          errors.push(
            issue(
              'TRANSFORM_TYPE_INCOMPATIBLE',
              `${operator} requires a string field.`,
              node.id,
              'conditions',
            ),
          );
        }
        if (
          operator !== undefined &&
          ['GREATER_THAN', 'GREATER_THAN_OR_EQUALS', 'LESS_THAN', 'LESS_THAN_OR_EQUALS'].includes(
            operator,
          ) &&
          !ORDERED_TYPES.has(baseType(column.dataType))
        ) {
          errors.push(
            issue(
              'TRANSFORM_TYPE_INCOMPATIBLE',
              `${operator} is not supported for ${column.dataType}.`,
              node.id,
              'conditions',
            ),
          );
        }
      }
      return KNOWN(columns);
    }
    case 'DROP_DUPLICATES':
      requireFields('matchFields', strings(node.config.matchFields));
      requireFields(
        'orderBy',
        records(node.config.orderBy)
          .map((row) => text(row.field))
          .filter(isString),
      );
      return KNOWN(columns);
    case 'DROP_NULL_FIELDS':
      warnings.push(
        issue(
          'OUTPUT_SCHEMA_RUNTIME_DEPENDENT',
          'Fields containing only null values are selected from runtime data, so downstream fields cannot be guaranteed.',
          node.id,
        ),
      );
      return RUNTIME_DEPENDENT;
    case 'REMOVE_NULL_ROWS':
      requireFields('fields', strings(node.config.fields));
      return KNOWN(columns);
    case 'FILL_MISSING_VALUES': {
      const field = text(node.config.field);
      if (field === undefined || !requireFields('field', [field])) return KNOWN(columns);
      const strategy = text(node.config.strategy);
      const column = columns.find((candidate) => candidate.name === field)!;
      if (
        (strategy === 'MEAN' || strategy === 'MEDIAN') &&
        !NUMERIC_TYPES.has(baseType(column.dataType))
      ) {
        errors.push(
          issue(
            'TRANSFORM_TYPE_INCOMPATIBLE',
            `${strategy} requires a numeric field.`,
            node.id,
            'field',
          ),
        );
      }
      return KNOWN(columns);
    }
    case 'AGGREGATE': {
      const groupBy = strings(node.config.groupBy);
      const aggregations = records(node.config.aggregations);
      requireFields('groupBy', groupBy);
      requireFields(
        'aggregations',
        aggregations.map((row) => text(row.sourceField)).filter(isString),
      );
      const outputNames = [
        ...groupBy,
        ...aggregations.map((row) => text(row.outputField)).filter(isString),
      ];
      const repeated = duplicates(outputNames);
      if (repeated.length > 0) {
        errors.push(
          issue(
            'DUPLICATE_OUTPUT_FIELD',
            `Aggregate output fields must be unique: ${repeated.join(', ')}.`,
            node.id,
            'aggregations',
          ),
        );
      }
      const aggregateColumns = aggregations.flatMap((row) => {
        const source = columns.find((column) => column.name === text(row.sourceField));
        const output = text(row.outputField);
        const fn = text(row.function);
        if (source === undefined || output === undefined || fn === undefined) return [];
        if (['SUM', 'AVG'].includes(fn) && !NUMERIC_TYPES.has(baseType(source.dataType))) {
          errors.push(
            issue(
              'TRANSFORM_TYPE_INCOMPATIBLE',
              `${fn} requires a numeric field.`,
              node.id,
              'aggregations',
            ),
          );
        }
        return [
          {
            name: output,
            dataType: fn === 'COUNT' ? 'long' : fn === 'AVG' ? 'double' : source.dataType,
            nullable: fn !== 'COUNT',
          },
        ];
      });
      const groupColumns = groupBy.flatMap((field) => {
        const column = columns.find((candidate) => candidate.name === field);
        return column === undefined ? [] : [column];
      });
      return repeated.length === 0 ? KNOWN([...groupColumns, ...aggregateColumns]) : KNOWN(columns);
    }
    case 'MANUAL_SQL': {
      const sql = text(node.config.sql);
      if (
        sql === undefined ||
        !/^\s*(select|with)\b/iu.test(sql) ||
        !/\binput\b/iu.test(sql) ||
        /\b(insert|update|delete|merge|create|alter|drop|truncate)\b/iu.test(sql) ||
        /;\s*\S/u.test(sql)
      ) {
        errors.push(
          issue(
            'MANUAL_SQL_INVALID',
            'Manual SQL must be one read-only SELECT or CTE query that reads from input.',
            node.id,
            'sql',
          ),
        );
        return RUNTIME_DEPENDENT;
      }
      const analysis = analyzeManualSql(sql, columns);
      if (analysis.missingFields.length > 0) {
        errors.push(
          issue(
            'TRANSFORM_FIELD_NOT_FOUND',
            `These fields are not produced by the upstream node: ${analysis.missingFields.join(', ')}.`,
            node.id,
            'sql',
          ),
        );
        return RUNTIME_DEPENDENT;
      }
      if (analysis.columns !== undefined) return KNOWN(analysis.columns);
      warnings.push(
        issue(
          'OUTPUT_SCHEMA_RUNTIME_DEPENDENT',
          'This SQL output schema requires Spark analysis and will be checked again before writing.',
          node.id,
          'sql',
        ),
      );
      return RUNTIME_DEPENDENT;
    }
    default:
      errors.push(
        issue(
          'TRANSFORM_SCHEMA_UNSUPPORTED',
          `Schema validation is not implemented for transformation type ${node.definitionType}.`,
          node.id,
        ),
      );
      return RUNTIME_DEPENDENT;
  }
}

function inputSchema(
  graph: PipelineGraph,
  nodeId: string,
  schemas: ReadonlyMap<string, PipelineNodeSchema>,
): PipelineNodeSchema {
  const incoming = graph.edges.find((edge) => edge.targetNodeId === nodeId);
  return incoming === undefined ? UNAVAILABLE : (schemas.get(incoming.sourceNodeId) ?? UNAVAILABLE);
}

function topologicalNodes(graph: PipelineGraph): readonly PipelineNode[] {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  graph.edges.forEach((edge) => {
    if (indegree.has(edge.targetNodeId))
      indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  });
  const queue = graph.nodes.filter((node) => indegree.get(node.id) === 0);
  const result: PipelineNode[] = [];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    result.push(node);
    for (const next of outgoing.get(node.id) ?? []) {
      const value = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, value);
      if (value === 0) {
        const candidate = graph.nodes.find((item) => item.id === next);
        if (candidate !== undefined) queue.push(candidate);
      }
    }
  }
  return result.length === graph.nodes.length ? result : graph.nodes;
}

function schemaMismatch(
  source: readonly PipelineDatasetColumn[],
  target: readonly PipelineDatasetColumn[],
): readonly string[] {
  const sourceByName = new Map(source.map((column) => [column.name, normalizeColumn(column)]));
  const targetByName = new Map(target.map((column) => [column.name, normalizeColumn(column)]));
  const messages: string[] = [];
  const missing = target
    .filter((column) => !sourceByName.has(column.name))
    .map((column) => column.name);
  const extra = source
    .filter((column) => !targetByName.has(column.name))
    .map((column) => column.name);
  if (missing.length > 0) messages.push(`Missing fields: ${missing.join(', ')}.`);
  if (extra.length > 0) messages.push(`Unexpected fields: ${extra.join(', ')}.`);
  for (const [name, sourceColumn] of sourceByName) {
    const targetColumn = targetByName.get(name);
    if (targetColumn === undefined) continue;
    if (!canAppendType(sourceColumn.dataType, targetColumn.dataType)) {
      messages.push(
        `${name} is ${sourceColumn.dataType}, target requires ${targetColumn.dataType}.`,
      );
    }
    if (sourceColumn.nullable && !targetColumn.nullable) {
      messages.push(`${name} may be null but the target field is required.`);
    }
  }
  return messages;
}

function canAppendType(source: string, target: string): boolean {
  const from = baseType(source);
  const to = baseType(target);
  if (from === to) {
    if (from !== 'decimal') return true;
    const sourceDecimal = decimalParts(source);
    const targetDecimal = decimalParts(target);
    return sourceDecimal === undefined || targetDecimal === undefined
      ? source === target
      : sourceDecimal.scale <= targetDecimal.scale &&
          sourceDecimal.precision - sourceDecimal.scale <=
            targetDecimal.precision - targetDecimal.scale;
  }
  const widening = new Map<string, readonly string[]>([
    ['byte', ['short', 'int', 'long', 'float', 'double']],
    ['short', ['int', 'long', 'float', 'double']],
    ['int', ['long', 'double']],
    ['float', ['double']],
  ]);
  return widening.get(from)?.includes(to) === true;
}

interface ManualSqlAnalysis {
  readonly columns?: readonly PipelineDatasetColumn[];
  readonly missingFields: readonly string[];
}

/**
 * Statically analyses the common Spark SQL SELECT shape used by the editor.
 * It deliberately separates column-reference validation from output inference:
 * an expression we cannot type still cannot hide a stale upstream field.
 */
function analyzeManualSql(sql: string, input: readonly PipelineDatasetColumn[]): ManualSqlAnalysis {
  const match =
    /^\s*select\s+([\s\S]+?)\s+from\s+`?input`?(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?([\s\S]*?)\s*;?\s*$/iu.exec(
      sql,
    );
  if (match === null) return { missingFields: [] };
  const projection = match[1]?.trim();
  if (projection === undefined) return { missingFields: [] };

  const known = new Map(input.map((column) => [column.name.toLowerCase(), column]));
  const result: PipelineDatasetColumn[] = [];
  const referenced = new Set<string>();
  let fullyInferred = true;
  for (const item of splitSqlProjection(projection)) {
    const inferred = inferSqlProjection(item, known, referenced);
    if (inferred === 'STAR') result.push(...input);
    else if (inferred === undefined) fullyInferred = false;
    else result.push(inferred);
  }

  for (const reference of sqlColumnReferences(match[2] ?? '')) referenced.add(reference);
  const outputNames = new Set(result.map((column) => column.name.toLowerCase()));
  const missingFields = [...referenced]
    .filter((field) => !known.has(field) && !outputNames.has(field))
    .sort();
  if (missingFields.length > 0) return { missingFields };
  if (
    !fullyInferred ||
    result.length === 0 ||
    duplicates(result.map((column) => column.name)).length > 0
  ) {
    return { missingFields: [] };
  }
  return { columns: result, missingFields: [] };
}

function inferSqlProjection(
  item: string,
  known: ReadonlyMap<string, PipelineDatasetColumn>,
  referenced: Set<string>,
): PipelineDatasetColumn | 'STAR' | undefined {
  const aliased =
    /^(.*?)(?:\s+as\s+`?([A-Za-z_][A-Za-z0-9_]*)`?)\s*$/iu.exec(item) ??
    /^(.*\S)\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s*$/u.exec(item);
  const expression = (aliased?.[1] ?? item).trim();
  const alias = aliased?.[2];
  if (/^(?:input\.)?\*$/iu.test(expression)) return 'STAR';

  const direct = /^(?:`?input`?\.)?`?([A-Za-z_][A-Za-z0-9_]*)`?$/iu.exec(expression);
  if (direct !== null) {
    const field = direct[1]!.toLowerCase();
    referenced.add(field);
    const source = known.get(field);
    return source === undefined ? undefined : { ...source, name: alias ?? source.name };
  }

  const unary =
    /^(upper|lower|trim|ltrim|rtrim)\s*\(\s*(?:`?input`?\.)?`?([A-Za-z_][A-Za-z0-9_]*)`?\s*\)$/iu.exec(
      expression,
    );
  if (unary !== null) {
    const field = unary[2]!.toLowerCase();
    referenced.add(field);
    const source = known.get(field);
    return source === undefined || alias === undefined
      ? undefined
      : { name: alias, dataType: 'string', nullable: source.nullable };
  }

  const aggregate =
    /^(count|sum|avg|min|max)\s*\(\s*(\*|(?:`?input`?\.)?`?[A-Za-z_][A-Za-z0-9_]*`?)\s*\)$/iu.exec(
      expression,
    );
  if (aggregate !== null) {
    const argument = aggregate[2]!;
    const field = argument
      .replace(/`/gu, '')
      .replace(/^input\./iu, '')
      .toLowerCase();
    const source = argument === '*' ? undefined : known.get(field);
    if (argument !== '*') referenced.add(field);
    if (alias === undefined || (argument !== '*' && source === undefined)) return undefined;
    const fn = aggregate[1]!.toLowerCase();
    return {
      name: alias,
      dataType: fn === 'count' ? 'long' : fn === 'avg' ? 'double' : source!.dataType,
      nullable: fn !== 'count',
    };
  }

  const cast =
    /^cast\s*\(\s*(?:`?input`?\.)?`?([A-Za-z_][A-Za-z0-9_]*)`?\s+as\s+([A-Za-z]+(?:\s*\(\s*\d+\s*,\s*\d+\s*\))?)\s*\)$/iu.exec(
      expression,
    );
  if (cast !== null) {
    const field = cast[1]!.toLowerCase();
    referenced.add(field);
    const source = known.get(field);
    return source === undefined || alias === undefined
      ? undefined
      : { name: alias, dataType: normalizeType(cast[2]!), nullable: source.nullable };
  }

  for (const reference of sqlColumnReferences(expression)) referenced.add(reference);
  return undefined;
}

function splitSqlProjection(value: string): readonly string[] {
  const items: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | '`' | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== undefined) {
      if (character === quote && value[index + 1] === quote) index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      items.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(value.slice(start).trim());
  return items.filter(Boolean);
}

const SQL_NON_COLUMN_WORDS = new Set([
  'and',
  'or',
  'not',
  'null',
  'true',
  'false',
  'where',
  'group',
  'by',
  'having',
  'order',
  'asc',
  'desc',
  'nulls',
  'first',
  'last',
  'limit',
  'offset',
  'as',
  'distinct',
  'case',
  'when',
  'then',
  'else',
  'end',
  'is',
  'in',
  'like',
  'rlike',
  'between',
  'input',
  'string',
  'boolean',
  'byte',
  'short',
  'int',
  'integer',
  'long',
  'float',
  'double',
  'decimal',
  'date',
  'timestamp',
]);

function sqlColumnReferences(value: string): readonly string[] {
  const scrubbed = value
    .replace(/--[^\n\r]*/gu, ' ')
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/'(?:''|[^'])*'/gu, ' ');
  const references = new Set<string>();
  const words = /`?([A-Za-z_][A-Za-z0-9_]*)`?/gu;
  for (const match of scrubbed.matchAll(words)) {
    const word = match[1]!.toLowerCase();
    const tail = scrubbed.slice((match.index ?? 0) + match[0].length);
    if (SQL_NON_COLUMN_WORDS.has(word) || /^\s*\(/u.test(tail)) continue;
    references.add(word);
  }
  return [...references];
}

function normalizeColumn(column: PipelineDatasetColumn): PipelineDatasetColumn {
  return { ...column, dataType: normalizeType(column.dataType) };
}

function normalizeType(value: string): string {
  const type = value.trim().toLowerCase().replace(/\s+/gu, ' ');
  if (/^decimal\s*\(/u.test(type)) return type.replace(/\s/gu, '');
  if (/^(varchar|char)(\(|$)/u.test(type) || type === 'text' || type === 'json' || type === 'jsonb')
    return 'string';
  if (['integer', 'int4'].includes(type)) return 'int';
  if (['bigint', 'int8'].includes(type)) return 'long';
  if (['smallint', 'int2'].includes(type)) return 'short';
  if (['real', 'float4'].includes(type)) return 'float';
  if (['double precision', 'float8'].includes(type)) return 'double';
  if (['bool'].includes(type)) return 'boolean';
  if (type.startsWith('timestamp')) return 'timestamp';
  return type;
}

function baseType(value: string): string {
  return normalizeType(value).replace(/\(.+\)$/u, '');
}

function decimalParts(
  value: string,
): { readonly precision: number; readonly scale: number } | undefined {
  const match = /^decimal\((\d+),(\d+)\)$/u.exec(normalizeType(value));
  return match === null ? undefined : { precision: Number(match[1]), scale: Number(match[2]) };
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value
        .filter(isString)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function records(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Readonly<Record<string, unknown>> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    else seen.add(value);
  }
  return [...repeated];
}

function issue(
  code: string,
  message: string,
  nodeId: string,
  field?: string,
): PipelineValidationIssue {
  return { code, message, nodeId, ...(field === undefined ? {} : { field }) };
}
