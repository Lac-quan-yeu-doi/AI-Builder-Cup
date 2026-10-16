import { TrinoCatalogStatementClient } from '@infrastructure/trino/catalog-exploration/trino-catalog-statement.client';

describe('TrinoCatalogStatementClient', () => {
  it('cancels an accepted query when fetching its next page fails', async () => {
    const nextUri = 'https://trino.example/v1/statement/query-1/page-1';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'query-1', nextUri }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new TrinoCatalogStatementClient('https://trino.example', 'celesnity', 'secret');

    await expect(client.execute('SELECT 1')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      nextUri,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
