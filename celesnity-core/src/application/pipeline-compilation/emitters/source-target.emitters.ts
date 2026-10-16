import { pythonLiteral } from '@application/pipeline-compilation/python-literal';
import type {
  CompiledNodeFragment,
  NodeCompileContext,
  PipelineNodeEmitter,
} from '@application/pipeline-compilation/pipeline-ir';
import {
  enumValue,
  requiredString,
} from '@application/pipeline-compilation/emitters/config-parser';
import { PipelineCompilationError } from '@domain/pipeline-compilation/errors/pipeline-compilation.error';

type PostgresSourceConfig =
  | {
      readonly sourceMode: 'DATABASE_SERVICE';
      readonly schemaName: string;
      readonly tableName: string;
    }
  | {
      readonly sourceMode: 'ICEBERG_CATALOG';
      readonly databaseName: string;
      readonly tableName: string;
    };

export class PostgresSourceEmitter implements PipelineNodeEmitter<PostgresSourceConfig> {
  public readonly definitionType = 'POSTGRES_SOURCE';

  public parseConfig(
    config: Readonly<Record<string, unknown>>,
    nodeId: string,
  ): PostgresSourceConfig {
    if (config.sourceMode === 'ICEBERG_CATALOG') {
      return {
        sourceMode: 'ICEBERG_CATALOG',
        databaseName: requiredCatalogIdentifier(config, 'catalogDatabaseName', nodeId),
        tableName: requiredCatalogIdentifier(config, 'catalogTableName', nodeId),
      };
    }
    return {
      sourceMode: 'DATABASE_SERVICE',
      schemaName: requiredString(config, 'schemaName', nodeId),
      tableName: requiredString(config, 'tableName', nodeId),
    };
  }

  public emit(context: NodeCompileContext, config: PostgresSourceConfig): CompiledNodeFragment {
    const output = context.variableForOutput('output');
    if (config.sourceMode === 'ICEBERG_CATALOG') {
      return {
        lines: [
          `${output} = spark.read.table(qualified_iceberg_table(${pythonLiteral(config.databaseName)}, ${pythonLiteral(config.tableName)}))`,
        ],
        outputs: new Map([['output', output]]),
      };
    }
    const table = `${quotePostgresIdentifier(config.schemaName)}.${quotePostgresIdentifier(config.tableName)}`;
    return {
      lines: [
        `${output} = (spark.read.format("jdbc")`,
        '    .option("url", require_env("CELESNITY_DB_JDBC_URL"))',
        '    .option("driver", require_env("CELESNITY_DB_DRIVER_CLASS"))',
        '    .option("user", first_env("CELESNITY_DB_JDBC_USER", "SOURCE_POSTGRES_USER"))',
        '    .option("password", first_env("CELESNITY_DB_JDBC_PASSWORD", "SOURCE_POSTGRES_PASSWORD"))',
        `    .option("dbtable", ${pythonLiteral(table)})`,
        '    .load())',
      ],
      outputs: new Map([['output', output]]),
    };
  }
}

type IcebergSourceConfig = {
  readonly databaseName: string;
  readonly tableName: string;
};

export class IcebergSourceEmitter implements PipelineNodeEmitter<IcebergSourceConfig> {
  public readonly definitionType = 'ICEBERG_SOURCE';

  public parseConfig(
    config: Readonly<Record<string, unknown>>,
    nodeId: string,
  ): IcebergSourceConfig {
    return {
      databaseName: requiredCatalogIdentifier(config, 'catalogDatabaseName', nodeId),
      tableName: requiredCatalogIdentifier(config, 'catalogTableName', nodeId),
    };
  }

  public emit(context: NodeCompileContext, config: IcebergSourceConfig): CompiledNodeFragment {
    const output = context.variableForOutput('output');
    return {
      lines: [
        `${output} = spark.read.table(qualified_iceberg_table(${pythonLiteral(config.databaseName)}, ${pythonLiteral(config.tableName)}))`,
      ],
      outputs: new Map([['output', output]]),
    };
  }
}

function requiredCatalogIdentifier(
  config: Readonly<Record<string, unknown>>,
  key: 'catalogDatabaseName' | 'catalogTableName',
  nodeId: string,
): string {
  const value = requiredString(config, key, nodeId);
  if (/\p{Cc}/u.test(value)) {
    throw PipelineCompilationError.issue(
      'NODE_CONFIG_INVALID',
      'Catalog identifiers cannot contain control characters.',
      { nodeId, field: key },
    );
  }
  return value;
}

type IcebergTargetConfig =
  | {
      readonly tableMode: 'CREATE_NEW';
      readonly databaseName: string;
      readonly tableName: string;
    }
  | {
      readonly tableMode: 'EXISTING';
      readonly databaseName?: string;
      readonly tableName?: string;
      readonly writeMode: 'APPEND' | 'OVERWRITE';
    };

export class IcebergTargetEmitter implements PipelineNodeEmitter<IcebergTargetConfig> {
  public readonly definitionType = 'ICEBERG_TARGET';

  public parseConfig(
    config: Readonly<Record<string, unknown>>,
    nodeId: string,
  ): IcebergTargetConfig {
    const tableMode = optionalTableMode(config, nodeId);
    if (tableMode === 'CREATE_NEW') {
      return {
        tableMode,
        databaseName: requiredIdentifier(config, 'databaseName', nodeId),
        tableName: requiredIdentifier(config, 'newTableName', nodeId),
      };
    }
    return {
      tableMode,
      ...optionalIdentifier(config, 'databaseName', nodeId),
      ...optionalIdentifier(config, 'tableName', nodeId),
      writeMode: enumValue(config, 'writeMode', ['APPEND', 'OVERWRITE'] as const, nodeId),
    };
  }

  public emit(context: NodeCompileContext, config: IcebergTargetConfig): CompiledNodeFragment {
    const databaseName = config.databaseName ?? context.definition.target?.databaseName;
    const tableName = config.tableName ?? context.definition.target?.tableName;
    if (databaseName === undefined || tableName === undefined) {
      throw PipelineCompilationError.issue(
        'NODE_CONFIG_INVALID',
        'The Iceberg target binding is unavailable.',
        { nodeId: context.node.id },
      );
    }
    const input = context.requireInput('input');
    const writeMode =
      config.tableMode === 'CREATE_NEW'
        ? 'CREATE'
        : config.writeMode === 'APPEND'
          ? 'APPEND'
          : 'OVERWRITE';
    return {
      lines: [
        `write_iceberg_target_with_output_facts(${input}, ${pythonLiteral(databaseName)}, ${pythonLiteral(tableName)}, ${pythonLiteral(writeMode)}, ${pythonLiteral(context.node.id)}, args.execution_id, workflow_output_plan)`,
      ],
      outputs: new Map(),
    };
  }
}

function optionalTableMode(
  config: Readonly<Record<string, unknown>>,
  nodeId: string,
): 'CREATE_NEW' | 'EXISTING' {
  if (config.tableMode === undefined || config.tableMode === null || config.tableMode === '') {
    return 'EXISTING';
  }
  return enumValue(config, 'tableMode', ['CREATE_NEW', 'EXISTING'] as const, nodeId);
}

function requiredIdentifier(
  config: Readonly<Record<string, unknown>>,
  key: 'databaseName' | 'newTableName',
  nodeId: string,
): string {
  const value = requiredString(config, key, nodeId);
  if (!/^[A-Za-z0-9_]+$/u.test(value)) {
    throw PipelineCompilationError.issue(
      'NODE_CONFIG_INVALID',
      `${key} must contain only letters, digits, and underscores.`,
      { nodeId },
    );
  }
  return value;
}

function optionalIdentifier(
  config: Readonly<Record<string, unknown>>,
  key: 'databaseName' | 'tableName',
  nodeId: string,
): Readonly<Partial<Record<'databaseName' | 'tableName', string>>> {
  const value = config[key];
  if (value === undefined || value === null || value === '') {
    return {};
  }
  if (typeof value !== 'string' || !/^[A-Za-z0-9_]+$/u.test(value)) {
    throw PipelineCompilationError.issue(
      'NODE_CONFIG_INVALID',
      `${key} must contain only letters, digits, and underscores.`,
      { nodeId },
    );
  }
  return { [key]: value };
}

function quotePostgresIdentifier(value: string): string {
  if (/\p{Cc}/u.test(value)) {
    throw PipelineCompilationError.issue(
      'NODE_CONFIG_INVALID',
      'Database identifiers cannot contain control characters.',
    );
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export const SOURCE_TARGET_EMITTERS: readonly PipelineNodeEmitter[] = [
  new PostgresSourceEmitter(),
  new IcebergSourceEmitter(),
  new IcebergTargetEmitter(),
];
