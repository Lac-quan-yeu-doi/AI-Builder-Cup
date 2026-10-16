import { describe, expect, it } from 'vitest';

import { createArchiveConnectionController } from '@/src/interface-adapters/controllers/connections/archive-connection.controller';
import { createCreateConnectionController } from '@/src/interface-adapters/controllers/connections/create-connection.controller';
import { createGetConnectionController } from '@/src/interface-adapters/controllers/connections/get-connection.controller';
import { createListConnectionsController } from '@/src/interface-adapters/controllers/connections/list-connections.controller';
import { createTestSavedConnectionController } from '@/src/interface-adapters/controllers/connections/test-saved-connection.controller';
import { createTestUnsavedConnectionController } from '@/src/interface-adapters/controllers/connections/test-unsaved-connection.controller';
import { createUpdateConnectionController } from '@/src/interface-adapters/controllers/connections/update-connection.controller';
import {
  presentConnection,
  presentConnectionVerification,
} from '@/src/interface-adapters/presenters/connection.presenter';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type {
  ConnectionVerificationResult,
  DataConnection,
  DataConnectionInput,
} from '@/src/entities/models/connection';

const connection: DataConnection = {
  id: 'connection-1',
  name: 'Warehouse',
  type: 'postgresql',
  host: 'db.internal',
  port: 5432,
  databaseName: 'analytics',
  username: 'loader',
  sslMode: 'require',
  applicationName: 'celesnity',
  verification: {
    status: 'failed',
    testedAt: '2026-08-10T01:05:00.000Z',
    message: 'Connection refused.',
  },
  createdAt: '2026-08-10T01:00:00.000Z',
  updatedAt: '2026-08-10T01:05:00.000Z',
};

const verification: ConnectionVerificationResult = {
  status: 'succeeded',
  testedAt: '2026-08-10T01:05:00.000Z',
  message: 'Connected.',
};

const validInput: DataConnectionInput = {
  name: 'Warehouse',
  details: {
    kind: 'structured',
    host: 'db.internal',
    port: 5432,
    databaseName: 'analytics',
    username: 'loader',
    password: ' secret ',
    sslMode: 'require',
    applicationName: 'celesnity',
  },
};

describe('connection presenter', () => {
  it('copies only UI-safe connection fields and nested verification data', () => {
    const unsafeConnection = {
      ...connection,
      password: 'secret',
      transport: { request: () => undefined },
    } as DataConnection;

    const result = presentConnection(unsafeConnection);

    expect(result).toEqual(connection);
    expect(result).not.toBe(unsafeConnection);
    expect(result.verification).not.toBe(unsafeConnection.verification);
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('transport');
  });

  it('copies a verification result without leaking transport fields', () => {
    const unsafeVerification = {
      ...verification,
      transport: { status: 200 },
    } as ConnectionVerificationResult;

    const result = presentConnectionVerification(unsafeVerification);

    expect(result).toEqual(verification);
    expect(result).not.toBe(unsafeVerification);
    expect(result).not.toHaveProperty('transport');
  });
});

describe('connection controllers', () => {
  it('lists connections through one use case and presents copied items', async () => {
    let calls = 0;
    const source = [connection] as const;
    const controller = createListConnectionsController(async () => {
      calls += 1;
      return source;
    });

    const result = await controller();

    expect(calls).toBe(1);
    expect(result).toEqual([connection]);
    expect(result).not.toBe(source);
    expect(result[0]).not.toBe(connection);
  });

  it('gets a connection without introducing a minimum identifier length', async () => {
    let receivedId: string | undefined;
    const controller = createGetConnectionController(async (id) => {
      receivedId = id;
      return connection;
    });

    const result = await controller('');

    expect(receivedId).toBe('');
    expect(result).toEqual(connection);
    expect(result).not.toBe(connection);
  });

  it('tests valid unsaved details and returns a copied verification view model', async () => {
    let received: unknown;
    const controller = createTestUnsavedConnectionController(async (details) => {
      received = details;
      return verification;
    });

    const result = await controller(validInput.details);

    expect(received).toEqual(validInput.details);
    expect(result).toEqual(verification);
    expect(result).not.toBe(verification);
  });

  it('tests a saved connection through its use case', async () => {
    let receivedId: string | undefined;
    const controller = createTestSavedConnectionController(async (id) => {
      receivedId = id;
      return verification;
    });

    const result = await controller('connection-1');

    expect(receivedId).toBe('connection-1');
    expect(result).toEqual(verification);
  });

  it('rejects a structurally invalid create input before invoking its use case', async () => {
    let calls = 0;
    const controller = createCreateConnectionController(async () => {
      calls += 1;
      return connection;
    });

    await expect(
      controller({
        name: 'Warehouse',
        details: { kind: 'structured', host: 'db.internal' },
      } as unknown as DataConnectionInput),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });

  it('creates a connection without tightening existing string rules', async () => {
    let received: DataConnectionInput | undefined;
    const controller = createCreateConnectionController(async (input) => {
      received = input;
      return connection;
    });
    const input: DataConnectionInput = {
      name: '',
      details: {
        kind: 'structured',
        host: '',
        port: 5432,
        databaseName: '',
        username: '',
        password: '',
        sslMode: 'disable',
        applicationName: '',
      },
    };

    const result = await controller(input);

    expect(received).toEqual(input);
    expect(result).toEqual(connection);
    expect(result).not.toHaveProperty('password');
  });

  it('updates a connection through one use case and presents the result', async () => {
    let received: { readonly id: string; readonly input: DataConnectionInput } | undefined;
    const controller = createUpdateConnectionController(async (id, input) => {
      received = { id, input };
      return connection;
    });

    const result = await controller('connection-1', validInput);

    expect(received).toEqual({ id: 'connection-1', input: validInput });
    expect(result).toEqual(connection);
    expect(result).not.toBe(connection);
  });

  it('rejects an invalid update identifier before invoking its use case', async () => {
    let calls = 0;
    const controller = createUpdateConnectionController(async () => {
      calls += 1;
      return connection;
    });

    await expect(controller(42 as unknown as string, validInput)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(calls).toBe(0);
  });

  it('archives a connection without invoking a presenter', async () => {
    let receivedId: string | undefined;
    const controller = createArchiveConnectionController(async (id) => {
      receivedId = id;
    });

    await expect(controller('connection-1')).resolves.toBeUndefined();
    expect(receivedId).toBe('connection-1');
  });

  it('rejects invalid discriminated-union details before testing', async () => {
    let calls = 0;
    const controller = createTestUnsavedConnectionController(async () => {
      calls += 1;
      return verification;
    });

    await expect(
      controller({ kind: 'url' } as unknown as DataConnectionInput['details']),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });
});
