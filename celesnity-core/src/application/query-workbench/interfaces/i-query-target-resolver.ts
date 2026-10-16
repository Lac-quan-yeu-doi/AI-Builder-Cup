import type {
  QueryContext,
  SqlStatement,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';

export interface QueryTableTarget {
  readonly catalog: string;
  readonly schema: string;
  readonly table: string;
}

export interface IQueryTargetResolver {
  resolve(statement: SqlStatement, context: QueryContext): readonly QueryTableTarget[];
}

export interface IQueryTargetMetadata {
  /** Rejects views and unknown relation types; returns the base table's columns. */
  columns(target: QueryTableTarget): Promise<readonly string[]>;
}
