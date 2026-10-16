import type {
  DatabaseMetadataSourceFactory,
  DatabaseMetadataSourceInput,
} from '@application/metadata-crawler/interfaces/i-database-metadata-source';
import { MetadataCrawlerErrorCode } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import { DatabaseMetadataSourceRegistry } from '@infrastructure/dbms/registry/database-metadata-source.registry';

function factory(connectorType: string): DatabaseMetadataSourceFactory {
  return {
    connectorType,
    capabilities: { descriptions: true, materializedViews: false, ddl: true },
    create: jest.fn(async (_input: DatabaseMetadataSourceInput) => ({
      listNamespaces: async function* () {},
      listRelations: async function* () {},
      describeRelation: jest.fn(),
      close: jest.fn(async () => undefined),
    })),
  };
}

describe('DatabaseMetadataSourceRegistry', () => {
  it('returns a factory by normalized connector type', () => {
    const postgres = factory('postgresql');
    const registry = new DatabaseMetadataSourceRegistry([postgres]);

    expect(registry.require('POSTGRESQL')).toBe(postgres);
  });

  it('rejects duplicate registrations at startup', () => {
    expect(
      () => new DatabaseMetadataSourceRegistry([factory('POSTGRESQL'), factory('postgresql')]),
    ).toThrow('registered more than once');
  });

  it('raises an unsupported connector error for unknown DBMS types', () => {
    const registry = new DatabaseMetadataSourceRegistry([factory('POSTGRESQL')]);

    expect(() => registry.require('ORACLE')).toThrow(
      expect.objectContaining({ code: MetadataCrawlerErrorCode.UNSUPPORTED_CONNECTOR }),
    );
  });
});
