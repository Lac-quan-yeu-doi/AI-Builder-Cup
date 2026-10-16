import type { TableRef } from '@domain/chart/models/query-definition';

export interface CompiledChartQuery {
  readonly sql: string;
  readonly context: { readonly catalog: string; readonly schema: string };
  readonly queryHash: string;
  readonly relations: readonly TableRef[];
  readonly outputAliases: readonly string[];
}
