import type { ChartActor } from '@application/chart/chart-authoring.use-cases';
import type { TableRef } from '@domain/chart/models/query-definition';

export interface ChartFieldMetadata {
  readonly table: TableRef;
  readonly column: string;
  readonly physicalType: string;
}

export interface IChartFieldMetadataReader {
  list(input: {
    readonly actor: ChartActor;
    readonly relations: readonly TableRef[];
  }): Promise<readonly ChartFieldMetadata[]>;
}
