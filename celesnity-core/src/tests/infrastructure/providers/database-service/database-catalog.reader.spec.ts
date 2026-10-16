import { CatalogError, CatalogErrorCode } from '@domain/catalog-exploration/errors/catalog.errors';
import { Catalog } from '@domain/catalog-exploration/models/catalog';
import { Namespace } from '@domain/catalog-exploration/models/namespace';
import type { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import { DatabaseCatalogReader } from '@infrastructure/providers/database-service/database-catalog.reader';

describe('DatabaseCatalogReader', () => {
  it('returns true only for a namespace visible and writable to the current organization', async () => {
    const catalogs = {
      listVisibleCatalogs: jest
        .fn()
        .mockResolvedValue([Catalog.create('iceberg', 'celesnity')]),
      listWritableSchemas: jest
        .fn()
        .mockResolvedValue([Namespace.create('iceberg', 'kasadata')]),
    } as unknown as Pick<
      CatalogExplorationUseCases,
      'listVisibleCatalogs' | 'listWritableSchemas'
    >;
    const reader = new DatabaseCatalogReader(catalogs);

    await expect(reader.exists('kasadata')).resolves.toBe(true);
    await expect(reader.exists('analytics')).resolves.toBe(false);
    expect(catalogs.listWritableSchemas).toHaveBeenCalledWith('iceberg');
  });

  it('preserves the categorized catalog-unavailable error', async () => {
    const unavailable = CatalogError.unavailable();
    const catalogs = {
      listVisibleCatalogs: jest.fn().mockRejectedValue(unavailable),
      listWritableSchemas: jest.fn(),
    } as unknown as Pick<
      CatalogExplorationUseCases,
      'listVisibleCatalogs' | 'listWritableSchemas'
    >;
    const reader = new DatabaseCatalogReader(catalogs);

    await expect(reader.exists('kasadata')).rejects.toMatchObject({
      code: CatalogErrorCode.UNAVAILABLE,
    });
    expect(catalogs.listWritableSchemas).not.toHaveBeenCalled();
  });
});
