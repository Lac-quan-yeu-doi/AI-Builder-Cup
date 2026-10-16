import type { ChartActor } from '@application/chart/chart-authoring.use-cases';
import type { TableRef } from '@domain/chart/models/query-definition';

export interface ResolvedChartRelation {
  readonly table: TableRef;
  readonly fingerprint: string;
}

export interface IChartCatalog {
  resolveAndAuthorize(input: {
    readonly actor: ChartActor;
    readonly relations: readonly TableRef[];
  }): Promise<readonly ResolvedChartRelation[]>;
}
