import { ConfigService } from '@nestjs/config';

import { DebeziumConnectClient } from '@infrastructure/data-workflow-watch-source/debezium-connect.client';
import type { DebeziumConnectError } from '@infrastructure/data-workflow-watch-source/debezium-connect.client';

describe('DebeziumConnectClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps an existing connector and treats a missing connector as undefined', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'cdc-1', config: {} }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    const client = new DebeziumConnectClient(
      new ConfigService({
        DEBEZIUM_CONNECT_URL: 'http://connect:8083',
        DEBEZIUM_CONNECT_TIMEOUT_MS: 1000,
      }),
    );

    await expect(client.get('cdc-1')).resolves.toMatchObject({ name: 'cdc-1' });
    await expect(client.get('missing')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://connect:8083/connectors/cdc-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('probes the Connect collection endpoint without inventing a connector id', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const client = new DebeziumConnectClient(
      new ConfigService({ DEBEZIUM_CONNECT_URL: 'http://connect:8083' }),
    );

    await expect(client.checkHealth()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'http://connect:8083/connectors',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('does not expose response bodies in connector errors', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('customer-password-should-not-leak'));
    const client = new DebeziumConnectClient(
      new ConfigService({ DEBEZIUM_CONNECT_URL: 'http://connect:8083' }),
    );

    await expect(client.get('cdc-1')).rejects.toMatchObject({
      status: 503,
      code: 'CONNECT_UNAVAILABLE',
      message: 'CONNECT_UNAVAILABLE',
    } satisfies Partial<DebeziumConnectError>);
  });

  it('reads connector and every task state from the status endpoint', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'cdc-1',
          connector: { state: 'RUNNING', worker_id: 'worker-1' },
          tasks: [
            { id: 0, state: 'RUNNING', worker_id: 'worker-1' },
            { id: 1, state: 'FAILED', worker_id: 'worker-1', trace: 'secret trace' },
          ],
        }),
        { status: 200 },
      ),
    );
    const client = new DebeziumConnectClient(
      new ConfigService({ DEBEZIUM_CONNECT_URL: 'http://connect:8083' }),
    );

    await expect(client.getStatus('cdc-1')).resolves.toEqual({
      name: 'cdc-1',
      connectorState: 'RUNNING',
      taskStates: ['RUNNING', 'FAILED'],
    });
  });

  it('sends create/update/pause requests through the REST boundary', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const client = new DebeziumConnectClient(
      new ConfigService({ DEBEZIUM_CONNECT_URL: 'http://connect:8083' }),
    );
    const config = { 'snapshot.mode': 'no_data' };

    await client.create('cdc-1', config);
    await client.update('cdc-1', config);
    await client.pause('cdc-1');
    await client.resume('cdc-1');

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://connect:8083/connectors',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://connect:8083/connectors/cdc-1/config',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'http://connect:8083/connectors/cdc-1/pause',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      'http://connect:8083/connectors/cdc-1/resume',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
