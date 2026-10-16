import type { DatabaseMetadataSourceFactory } from '@application/metadata-crawler/interfaces/i-database-metadata-source';

export function metadataSourceContract(
  connectorType: string,
  createFactory: () => DatabaseMetadataSourceFactory,
): void {
  describe(`${connectorType} metadata source contract`, () => {
    it('exposes connector capabilities', () => {
      const factory = createFactory();
      expect(factory.connectorType).toBe(connectorType);
      expect(factory.capabilities).toEqual(
        expect.objectContaining({ descriptions: expect.any(Boolean) }),
      );
    });
  });
}
