import { describe, expect, it, vi } from 'vitest';

import { InputParseError } from '@/src/entities/errors/application-errors';
import { createCompileCanonicalChartQueryController } from '@/src/interface-adapters/controllers/canonical-charts/compile-canonical-chart-query.controller';

const queryDefinition = {
  schemaVersion: 1,
  mode: 'NATIVE' as const,
  context: { catalog: 'iceberg', schema: 'kasadata' },
  parameters: [],
  sql: 'SELECT 1',
};

describe('compile canonical chart query controller', () => {
  it('validates and delegates the canonical query input', async () => {
    const useCase = vi.fn().mockResolvedValue({
      mode: 'NATIVE',
      context: { catalog: 'iceberg', schema: 'kasadata' },
      sql: 'SELECT 1',
    });
    const controller = createCompileCanonicalChartQueryController(useCase);

    await expect(controller({ queryDefinition, parameterValues: {} })).resolves.toEqual({
      mode: 'NATIVE',
      context: { catalog: 'iceberg', schema: 'kasadata' },
      sql: 'SELECT 1',
    });
    expect(useCase).toHaveBeenCalledWith({ queryDefinition, parameterValues: {} });
  });

  it('rejects malformed compile input before the use case', async () => {
    const useCase = vi.fn();
    const controller = createCompileCanonicalChartQueryController(useCase);

    await expect(controller({ queryDefinition: { mode: 'NATIVE' } })).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});
