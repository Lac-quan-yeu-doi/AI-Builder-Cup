import { pythonLiteral } from '@application/pipeline-compilation/python-literal';
import type {
  CompiledNodeFragment,
  NodeCompileContext,
  PipelineNodeEmitter,
} from '@application/pipeline-compilation/pipeline-ir';
import {
  enumValue,
  invalid,
  recordList,
  requiredString,
  stringList,
  typedValue,
} from '@application/pipeline-compilation/emitters/config-parser';

type NoConfig = Readonly<Record<string, never>>;

abstract class SingleOutputEmitter<TConfig> implements PipelineNodeEmitter<TConfig> {
  public abstract readonly definitionType: string;
  public abstract parseConfig(value: Readonly<Record<string, unknown>>, nodeId: string): TConfig;
  protected abstract expression(context: NodeCompileContext, config: TConfig): readonly string[];

  public emit(context: NodeCompileContext, config: TConfig): CompiledNodeFragment {
    const output = context.variableForOutput('output');
    return {
      lines: this.expression(context, config),
      outputs: new Map([['output', output]]),
    };
  }
}

interface FieldListConfig {
  readonly fields: readonly string[];
}

export class SelectFieldsEmitter extends SingleOutputEmitter<FieldListConfig> {
  public readonly definitionType = 'SELECT_FIELDS';
  public parseConfig(config: Readonly<Record<string, unknown>>, nodeId: string): FieldListConfig {
    return { fields: stringList(config, 'fields', nodeId, { required: true }) };
  }
  protected expression(context: NodeCompileContext, config: FieldListConfig): readonly string[] {
    const input = context.requireInput('input');
    const output = context.variableForOutput('output');
    return [
      `${output} = ${input}.select(${config.fields.map((field) => `F.col(${pythonLiteral(field)})`).join(', ')})`,
    ];
  }
}

export class DropFieldsEmitter extends SingleOutputEmitter<FieldListConfig> {
  public readonly definitionType = 'DROP_FIELDS';
  public parseConfig(config: Readonly<Record<string, unknown>>, nodeId: string): FieldListConfig {
    return { fields: stringList(config, 'fields', nodeId, { required: true }) };
  }
  protected expression(context: NodeCompileContext, config: FieldListConfig): readonly string[] {
    const input = context.requireInput('input');
    const output = context.variableForOutput('output');
    return [`${output} = ${input}.drop(${config.fields.map(pythonLiteral).join(', ')})`];
  }
}

interface RenameFieldConfig {
  readonly sourceField: string;
  readonly targetField: string;
}

export class RenameFieldEmitter extends SingleOutputEmitter<RenameFieldConfig> {
  public readonly definitionType = 'RENAME_FIELD';
  public parseConfig(config: Readonly<Record<string, unknown>>, nodeId: string): RenameFieldConfig {
    return {
      sourceField: requiredString(config, 'sourceField', nodeId),
      targetField: requiredString(config, 'targetField', nodeId),
    };
  }
  protected expression(context: NodeCompileContext, config: RenameFieldConfig): readonly string[] {
    const input = context.requireInput('input');
    const output = context.variableForOutput('output');
    return [
      `${output} = ${input}.withColumnRenamed(${pythonLiteral(config.sourceField)}, ${pythonLiteral(config.targetField)})`,
    ];
  }
}

interface SchemaMapping {
  readonly sourceField: string;
  readonly targetField: string;
  readonly targetType: string;
}

interface ChangeSchemaConfig {
  readonly mappings: readonly SchemaMapping[];
}

const SPARK_TYPES = new Set([
  'binary',
  'boolean',
  'byte',
  'date',
  'decimal',
  'double',
  'float',
  'int',
  'integer',
  'long',
  'short',
  'string',
  'timestamp',
]);
const DECIMAL_TYPE = /^decimal\(\d{1,2},\d{1,2}\)$/u;

export class ChangeSchemaEmitter extends SingleOutputEmitter<ChangeSchemaConfig> {
  public readonly definitionType = 'CHANGE_SCHEMA';
  public parseConfig(
    config: Readonly<Record<string, unknown>>,
    nodeId: string,
  ): ChangeSchemaConfig {
    const mappings = recordList(config, 'mappings', nodeId, { required: true }).map((mapping) => {
      const parsed = {
        sourceField: requiredString(mapping, 'sourceField', nodeId),
        targetField: requiredString(mapping, 'targetField', nodeId),
        targetType: requiredString(mapping, 'targetType', nodeId).toLowerCase(),
      };
      if (!SPARK_TYPES.has(parsed.targetType) && !DECIMAL_TYPE.test(parsed.targetType)) {
        invalid(nodeId, 'mappings', `Unsupported Spark target type ${parsed.targetType}.`);
      }
      return parsed;
    });
    return { mappings };
  }
  protected expression(context: NodeCompileContext, config: ChangeSchemaConfig): readonly string[] {
    const input = context.requireInput('input');
    const output = context.variableForOutput('output');
    const columns = config.mappings.map(
      (mapping) =>
        `F.col(${pythonLiteral(mapping.sourceField)}).cast(${pythonLiteral(mapping.targetType)}).alias(${pythonLiteral(mapping.targetField)})`,
    );
    return [`${output} = ${input}.select(${columns.join(', ')})`];
  }
}

type FilterOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUALS'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUALS'
  | 'CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'IN'
  | 'IS_NULL'
  | 'IS_NOT_NULL';
interface FilterCondition {
  readonly key: string;
  readonly operator: FilterOperator;
  readonly value?: unknown;
}
interface FilterConfig {
  readonly combination: 'AND' | 'OR';
  readonly conditions: readonly FilterCondition[];
}
const FILTER_OPERATORS: readonly FilterOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUALS',
  'LESS_THAN',
  'LESS_THAN_OR_EQUALS',
  'CONTAINS',
  'STARTS_WITH',
  'ENDS_WITH',
  'IN',
  'IS_NULL',
  'IS_NOT_NULL',
];

export class FilterEmitter extends SingleOutputEmitter<FilterConfig> {
  public readonly definitionType = 'FILTER';
  public parseConfig(config: Readonly<Record<string, unknown>>, nodeId: string): FilterConfig {
    const combination = enumValue(config, 'combination', ['AND', 'OR'] as const, nodeId);
    const conditions = recordList(config, 'conditions', nodeId, { required: true }).map(
      (condition): FilterCondition => {
        const operator = enumValue(condition, 'operator', FILTER_OPERATORS, nodeId);
        const key = requiredString(condition, 'key', nodeId);
        const value =
          condition.value === undefined
            ? undefined
            : Array.isArray(condition.value)
              ? condition.value.map((entry) => typedValue(entry, nodeId, 'conditions'))
              : typedValue(condition.value, nodeId, 'conditions');
        if (!['IS_NULL', 'IS_NOT_NULL'].includes(operator) && value === undefined) {
          invalid(nodeId, 'conditions', `${operator} requires a value.`);
        }
        if (operator === 'IN' && (!Array.isArray(value) || value.length === 0)) {
          invalid(nodeId, 'conditions', 'IN requires a non-empty list value.');
        }
        return { key, operator, ...(value === undefined ? {} : { value }) };
      },
    );
    return { combination, conditions };
  }
  protected expression(context: NodeCompileContext, config: FilterConfig): readonly string[] {
    const input = context.requireInput('input');
    const output = context.variableForOutput('output');
    const joiner = config.combination === 'AND' ? ' & ' : ' | ';
    const predicate = config.conditions
      .map(filterExpression)
      .map((item) => `(${item})`)
      .join(joiner);
    return [`${output} = ${input}.filter(${predicate})`];
  }
}

function filterExpression(condition: FilterCondition): string {
  const column = `F.col(${pythonLiteral(condition.key)})`;
  switch (condition.operator) {
    case 'EQUALS':
      return `${column} == F.lit(${pythonLiteral(condition.value)})`;
    case 'NOT_EQUALS':
      return `${column} != F.lit(${pythonLiteral(condition.value)})`;
    case 'GREATER_THAN':
      return `${column} > F.lit(${pythonLiteral(condition.value)})`;
    case 'GREATER_THAN_OR_EQUALS':
      return `${column} >= F.lit(${pythonLiteral(condition.value)})`;
    case 'LESS_THAN':
      return `${column} < F.lit(${pythonLiteral(condition.value)})`;
    case 'LESS_THAN_OR_EQUALS':
      return `${column} <= F.lit(${pythonLiteral(condition.value)})`;
    case 'CONTAINS':
      return `${column}.contains(${pythonLiteral(condition.value)})`;
    case 'STARTS_WITH':
      return `${column}.startswith(${pythonLiteral(condition.value)})`;
    case 'ENDS_WITH':
      return `${column}.endswith(${pythonLiteral(condition.value)})`;
    case 'IN':
      return `${column}.isin(${(condition.value as readonly unknown[]).map(pythonLiteral).join(', ')})`;
    case 'IS_NULL':
      return `${column}.isNull()`;
    case 'IS_NOT_NULL':
      return `${column}.isNotNull()`;
  }
}

interface OrderBy {
  readonly field: string;
  readonly direction: 'ASC' | 'DESC';
  readonly nulls: 'FIRST' | 'LAST';
}
interface DropDuplicatesConfig {
  readonly matchFields: readonly string[];
  readonly orderBy: readonly OrderBy[];
  readonly keep: 'FIRST' | 'LAST';
}

export class DropDuplicatesEmitter extends SingleOutputEmitter<DropDuplicatesConfig> {
  public readonly definitionType = 'DROP_DUPLICATES';
  public parseConfig(
    config: Readonly<Record<string, unknown>>,
    nodeId: string,
  ): DropDuplicatesConfig {
    const orderBy = recordList(config, 'orderBy', nodeId).map((order) => ({
      field: requiredString(order, 'field', nodeId),
      direction: enumValue(order, 'direction', ['ASC', 'DESC'] as const, nodeId),
      nulls: enumValue(order, 'nulls', ['FIRST', 'LAST'] as const, nodeId),
    }));
    const matchFields = stringList(config, 'matchFields', nodeId);
    if (matchFields.length > 0 && orderBy.length === 0) {
      invalid(
        nodeId,
        'orderBy',
        'Ordering is required when duplicate match fields select a retained row.',
      );
    }
    return {
      matchFields,
      orderBy,
      keep: enumValue(config, 'keep', ['FIRST', 'LAST'] as const, nodeId),
    };
  }
  protected expression(
    context: NodeCompileContext,
    config: DropDuplicatesConfig,
  ): readonly string[] {
    const input = context.requireInput('input');
    const output = context.variableForOutput('output');
    if (config.orderBy.length === 0) {
      const args = config.matchFields.length === 0 ? '' : pythonLiteral(config.matchFields);
      return [`${output} = ${input}.dropDuplicates(${args})`];
    }
    const partition =
      config.matchFields.length === 0
        ? 'F.lit(1)'
        : config.matchFields.map((field) => `F.col(${pythonLiteral(field)})`).join(', ');
    const orders = config.orderBy.map((order) => {
      const direction = config.keep === 'LAST' ? invertDirection(order.direction) : order.direction;
      return `F.col(${pythonLiteral(order.field)}).${direction.toLowerCase()}_nulls_${order.nulls.toLowerCase()}()`;
    });
    const window = `window_${stableSuffix(context.node.id)}`;
    return [
      `${window} = Window.partitionBy(${partition}).orderBy(${orders.join(', ')})`,
      `${output} = (${input}.withColumn("__celesnity_row_number", F.row_number().over(${window})).filter(F.col("__celesnity_row_number") == 1).drop("__celesnity_row_number"))`,
    ];
  }
}

function invertDirection(value: 'ASC' | 'DESC'): 'ASC' | 'DESC' {
  return value === 'ASC' ? 'DESC' : 'ASC';
}

export class DropNullFieldsEmitter extends SingleOutputEmitter<NoConfig> {
  public readonly definitionType = 'DROP_NULL_FIELDS';
  public parseConfig(): NoConfig {
    return {};
  }
  protected expression(context: NodeCompileContext): readonly string[] {
    return [
      `${context.variableForOutput('output')} = drop_all_null_columns(${context.requireInput('input')})`,
    ];
  }
}

interface RemoveNullRowsConfig {
  readonly fields: readonly string[];
  readonly mode: 'ALL' | 'ANY';
}
export class RemoveNullRowsEmitter extends SingleOutputEmitter<RemoveNullRowsConfig> {
  public readonly definitionType = 'REMOVE_NULL_ROWS';
  public parseConfig(
    config: Readonly<Record<string, unknown>>,
    nodeId: string,
  ): RemoveNullRowsConfig {
    return {
      fields: stringList(config, 'fields', nodeId),
      mode: enumValue(config, 'mode', ['ALL', 'ANY'] as const, nodeId),
    };
  }
  protected expression(
    context: NodeCompileContext,
    config: RemoveNullRowsConfig,
  ): readonly string[] {
    const subset = config.fields.length === 0 ? '' : `, subset=${pythonLiteral(config.fields)}`;
    return [
      `${context.variableForOutput('output')} = ${context.requireInput('input')}.dropna(how=${pythonLiteral(config.mode.toLowerCase())}${subset})`,
    ];
  }
}

interface FillMissingValuesConfig {
  readonly field: string;
  readonly strategy: 'LITERAL' | 'MEAN' | 'MEDIAN' | 'MODE';
  readonly value?: unknown;
}
export class FillMissingValuesEmitter extends SingleOutputEmitter<FillMissingValuesConfig> {
  public readonly definitionType = 'FILL_MISSING_VALUES';
  public parseConfig(
    config: Readonly<Record<string, unknown>>,
    nodeId: string,
  ): FillMissingValuesConfig {
    const strategy = enumValue(
      config,
      'strategy',
      ['LITERAL', 'MEAN', 'MEDIAN', 'MODE'] as const,
      nodeId,
    );
    if (strategy === 'LITERAL' && config.value === undefined) {
      invalid(nodeId, 'value', 'A literal fill strategy requires a value.');
    }
    return {
      field: requiredString(config, 'field', nodeId),
      strategy,
      ...(config.value === undefined ? {} : { value: typedValue(config.value, nodeId, 'value') }),
    };
  }
  protected expression(
    context: NodeCompileContext,
    config: FillMissingValuesConfig,
  ): readonly string[] {
    return [
      `${context.variableForOutput('output')} = fill_missing_value(${context.requireInput('input')}, ${pythonLiteral(config.field)}, ${pythonLiteral(config.strategy)}, ${pythonLiteral(config.value ?? null)})`,
    ];
  }
}

interface Aggregation {
  readonly sourceField: string;
  readonly function: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';
  readonly outputField: string;
}
interface AggregateConfig {
  readonly groupBy: readonly string[];
  readonly aggregations: readonly Aggregation[];
}
export class AggregateEmitter extends SingleOutputEmitter<AggregateConfig> {
  public readonly definitionType = 'AGGREGATE';
  public parseConfig(config: Readonly<Record<string, unknown>>, nodeId: string): AggregateConfig {
    return {
      groupBy: stringList(config, 'groupBy', nodeId),
      aggregations: recordList(config, 'aggregations', nodeId, { required: true }).map(
        (aggregation) => ({
          sourceField: requiredString(aggregation, 'sourceField', nodeId),
          function: enumValue(
            aggregation,
            'function',
            ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'] as const,
            nodeId,
          ),
          outputField: requiredString(aggregation, 'outputField', nodeId),
        }),
      ),
    };
  }
  protected expression(context: NodeCompileContext, config: AggregateConfig): readonly string[] {
    const input = context.requireInput('input');
    const output = context.variableForOutput('output');
    const groupColumns = config.groupBy.map((field) => `F.col(${pythonLiteral(field)})`).join(', ');
    const aggregations = config.aggregations
      .map(
        (aggregation) =>
          `F.${aggregation.function.toLowerCase()}(F.col(${pythonLiteral(aggregation.sourceField)})).alias(${pythonLiteral(aggregation.outputField)})`,
      )
      .join(', ');
    return [
      config.groupBy.length === 0
        ? `${output} = ${input}.agg(${aggregations})`
        : `${output} = ${input}.groupBy(${groupColumns}).agg(${aggregations})`,
    ];
  }
}

interface ManualSqlConfig {
  readonly sql: string;
}

export class ManualSqlEmitter extends SingleOutputEmitter<ManualSqlConfig> {
  public readonly definitionType = 'MANUAL_SQL';

  public parseConfig(config: Readonly<Record<string, unknown>>, nodeId: string): ManualSqlConfig {
    return { sql: requiredString(config, 'sql', nodeId).replace(/;\s*$/u, '') };
  }

  protected expression(context: NodeCompileContext, config: ManualSqlConfig): readonly string[] {
    const input = context.requireInput('input');
    const output = context.variableForOutput('output');
    return [
      `${input}.createOrReplaceTempView("input")`,
      `${output} = spark.sql(${pythonLiteral(config.sql)})`,
    ];
  }
}

function stableSuffix(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export const DATAFRAME_EMITTERS: readonly PipelineNodeEmitter[] = [
  new ChangeSchemaEmitter(),
  new SelectFieldsEmitter(),
  new DropFieldsEmitter(),
  new RenameFieldEmitter(),
  new FilterEmitter(),
  new DropDuplicatesEmitter(),
  new DropNullFieldsEmitter(),
  new RemoveNullRowsEmitter(),
  new FillMissingValuesEmitter(),
  new AggregateEmitter(),
  new ManualSqlEmitter(),
];
