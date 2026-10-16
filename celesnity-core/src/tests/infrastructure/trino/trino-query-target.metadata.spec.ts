import { ConfigService } from '@nestjs/config';
import { TrinoStatementClient } from '@infrastructure/trino/query-workbench/trino-statement.client';
import { TrinoQueryTargetMetadata } from '@infrastructure/trino/query-workbench/trino-query-target.metadata';
import { CatalogAccessDeniedError } from '@application/catalog-exploration/catalog-access-authorizer';

describe('Trino query target metadata boundary', () => {
  const target = { catalog: 'iceberg', schema: 'analytics', table: 'events' };
  const create = () =>
    new TrinoQueryTargetMetadata(
      new ConfigService({
        TRINO_URL: 'http://localhost:8080',
        TRINO_USER: 'test',
        TRINO_PASSWORD: '',
      }),
    );
  afterEach(() => jest.restoreAllMocks());

  it('reads only metadata, follows pages, and returns base-table columns', async () => {
    const submit = jest
      .spyOn(TrinoStatementClient.prototype, 'submit')
      .mockResolvedValue({ id: 'query', nextUri: 'next' });
    const next = jest.spyOn(TrinoStatementClient.prototype, 'fetchNext').mockResolvedValue({
      data: [
        ['BASE TABLE', 'id'],
        ['BASE TABLE', 'secret'],
      ],
    });
    expect(await create().columns(target)).toEqual(['id', 'secret']);
    expect(submit.mock.calls[0]?.[0]).toContain('"iceberg".information_schema.tables');
    expect(submit.mock.calls[0]?.[0]).not.toContain('FROM "iceberg"."analytics"."events"');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data: [] },
    { data: [['VIEW', 'id']] },
    { data: [['MATERIALIZED VIEW', 'id']] },
    { data: [['BASE TABLE', null]] },
    { data: [['unknown', 'id']] },
  ])('fails closed on absent, indirect or malformed relation metadata: %j', async ({ data }) => {
    jest.spyOn(TrinoStatementClient.prototype, 'submit').mockResolvedValue({ id: 'query', data });
    const cancel = jest.spyOn(TrinoStatementClient.prototype, 'delete').mockResolvedValue();
    await expect(create().columns(target)).rejects.toBeInstanceOf(CatalogAccessDeniedError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('fails closed on engine errors and does not expose their details', async () => {
    jest
      .spyOn(TrinoStatementClient.prototype, 'submit')
      .mockResolvedValue({ error: { message: 'Sensitive backend description' } });
    await expect(create().columns(target)).rejects.toThrow(
      'Access to the requested catalog resource is denied.',
    );
  });
});
