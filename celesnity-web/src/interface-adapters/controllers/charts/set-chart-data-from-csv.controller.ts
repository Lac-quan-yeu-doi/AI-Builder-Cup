import { InputParseError } from '@/src/entities/errors/application-errors';
import type { SetChartDataFromCsvUseCase } from '@/src/application/use-cases/charts/set-chart-data-from-csv.use-case';
import {
  presentChart,
  type ChartViewModel,
} from '@/src/interface-adapters/presenters/chart.presenter';

import { setChartDataFromCsvMetaSchema } from './chart.schemas';

export interface SetChartDataFromCsvControllerInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly file: File;
}

export type SetChartDataFromCsvController = (
  input: SetChartDataFromCsvControllerInput,
) => Promise<ChartViewModel>;

export const createSetChartDataFromCsvController =
  (useCase: SetChartDataFromCsvUseCase): SetChartDataFromCsvController =>
  async (input: SetChartDataFromCsvControllerInput): Promise<ChartViewModel> => {
    const parsed = setChartDataFromCsvMetaSchema.safeParse({
      id: input.id,
      expectedVersion: input.expectedVersion,
    });
    if (!parsed.success)
      throw new InputParseError('Invalid chart CSV upload', { cause: parsed.error });
    if (!(input.file instanceof File)) {
      throw new InputParseError('A CSV file is required.');
    }
    return presentChart(
      await useCase({
        id: parsed.data.id,
        expectedVersion: parsed.data.expectedVersion,
        file: input.file,
      }),
    );
  };
