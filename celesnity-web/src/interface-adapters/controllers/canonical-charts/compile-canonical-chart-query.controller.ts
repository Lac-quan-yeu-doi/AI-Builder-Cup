import type { CompileCanonicalChartQueryUseCase } from '@/src/application/use-cases/canonical-charts/compile-canonical-chart-query.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { CompiledChartQuery, QueryDefinition } from '@/src/entities/models/canonical-chart';

import { compileCanonicalChartQuerySchema } from './canonical-chart.schemas';

export type CompileCanonicalChartQueryController = ReturnType<
  typeof createCompileCanonicalChartQueryController
>;

export const createCompileCanonicalChartQueryController =
  (useCase: CompileCanonicalChartQueryUseCase) =>
  async (input: unknown): Promise<CompiledChartQuery> => {
    const parsed = compileCanonicalChartQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid chart query compilation input.', { cause: parsed.error });
    }
    return useCase({
      queryDefinition: parsed.data.queryDefinition as unknown as QueryDefinition,
      parameterValues: parsed.data.parameterValues,
    });
  };
