import type { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import { PlantCatalogLookupUseCases } from '@application/plant-model/plant-catalog-lookup.use-cases';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { PlantModelErrorCode } from '@domain/plant-model/errors/plant-model.errors';
import type { PlantCatalogBinding } from '@domain/plant-model/models/plant-model';

const binding: PlantCatalogBinding = {
  mode: 'scalar',
  catalog: 'factory',
  schema: 'public',
  table: 'statuses',
  valueColumn: 'status',
  filters: [
    {
      column: 'id',
      operator: 'eq',
      operand: { kind: 'property', propertyDefinitionId: 'status_id' },
    },
  ],
};
const clock: IClock = { now: () => new Date('2026-09-12T00:00:00.000Z') };

describe('PlantCatalogLookupUseCases', () => {
  it('passes property parameters to the authorized catalog reader', async () => {
    const lookupValues = jest
      .fn()
      .mockResolvedValue({ rows: [{ value: 'running', label: 'Running' }] });
    const useCases = new PlantCatalogLookupUseCases(
      { lookupValues } as unknown as CatalogExplorationUseCases,
      clock,
    );
    await expect(useCases.resolve(binding, { status_id: 1 })).resolves.toEqual({
      kind: 'scalar',
      available: true,
      value: 'running',
      label: 'Running',
      resolvedAt: '2026-09-12T00:00:00.000Z',
    });
    expect(lookupValues).toHaveBeenCalledWith(
      'factory',
      'public',
      'statuses',
      expect.objectContaining({ filters: [{ column: 'id', operator: 'eq', value: 1 }], limit: 2 }),
    );
  });

  it('reports zero rows as unavailable and multiple rows as ambiguous', async () => {
    const lookupValues = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { value: 1, label: '1' },
          { value: 2, label: '2' },
        ],
      });
    const useCases = new PlantCatalogLookupUseCases(
      { lookupValues } as unknown as CatalogExplorationUseCases,
      clock,
    );
    await expect(useCases.resolve(binding, { status_id: 1 })).resolves.toEqual({
      kind: 'scalar',
      available: false,
      resolvedAt: '2026-09-12T00:00:00.000Z',
    });
    await expect(useCases.resolve(binding, { status_id: 1 })).rejects.toMatchObject({
      code: PlantModelErrorCode.CATALOG_LOOKUP_AMBIGUOUS,
    });
  });

  it('rejects unsafe identifiers before calling the catalog', async () => {
    const lookupValues = jest.fn();
    const useCases = new PlantCatalogLookupUseCases(
      { lookupValues } as unknown as CatalogExplorationUseCases,
      clock,
    );
    await expect(
      useCases.resolve({ ...binding, table: 'statuses; DROP TABLE x' }, { status_id: 1 }),
    ).rejects.toMatchObject({ code: PlantModelErrorCode.VALIDATION });
    expect(lookupValues).not.toHaveBeenCalled();
  });
});
