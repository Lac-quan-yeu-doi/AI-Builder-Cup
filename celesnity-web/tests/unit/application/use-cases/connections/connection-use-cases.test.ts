import { describe, expect, it } from 'vitest';

import { createArchiveConnectionUseCase } from '@/src/application/use-cases/connections/archive-connection.use-case';
import { createCreateConnectionUseCase } from '@/src/application/use-cases/connections/create-connection.use-case';
import { createGetConnectionUseCase } from '@/src/application/use-cases/connections/get-connection.use-case';
import { createListConnectionsUseCase } from '@/src/application/use-cases/connections/list-connections.use-case';
import { createTestSavedConnectionUseCase } from '@/src/application/use-cases/connections/test-saved-connection.use-case';
import { createTestUnsavedConnectionUseCase } from '@/src/application/use-cases/connections/test-unsaved-connection.use-case';
import { createUpdateConnectionUseCase } from '@/src/application/use-cases/connections/update-connection.use-case';
import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';
import type {
  ConnectionDetailsInput,
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
  verification: { status: 'untested' },
  createdAt: '2026-08-10T01:00:00.000Z',
  updatedAt: '2026-08-10T01:00:00.000Z',
};

const verification: ConnectionVerificationResult = {
  status: 'succeeded',
  testedAt: '2026-08-10T01:05:00.000Z',
};

class FakeConnectionRepository implements ConnectionRepository {
  public readonly connections = [connection];
  public gotId?: string;
  public testedUnsaved?: ConnectionDetailsInput;
  public testedSavedId?: string;
  public created?: DataConnectionInput;
  public updated?: { readonly id: string; readonly input: DataConnectionInput };
  public archivedId?: string;

  public async list(): Promise<readonly DataConnection[]> {
    return this.connections;
  }

  public async get(id: string): Promise<DataConnection> {
    this.gotId = id;
    return connection;
  }

  public async testUnsaved(details: ConnectionDetailsInput): Promise<ConnectionVerificationResult> {
    this.testedUnsaved = details;
    return verification;
  }

  public async testSaved(id: string): Promise<ConnectionVerificationResult> {
    this.testedSavedId = id;
    return verification;
  }

  public async create(input: DataConnectionInput): Promise<DataConnection> {
    this.created = input;
    return connection;
  }

  public async update(id: string, input: DataConnectionInput): Promise<DataConnection> {
    this.updated = { id, input };
    return connection;
  }

  public async archive(id: string): Promise<void> {
    this.archivedId = id;
  }
}

describe('connection use cases', () => {
  it('returns the repository connection list unchanged', async () => {
    const repository = new FakeConnectionRepository();

    const result = await createListConnectionsUseCase(repository)();

    expect(result).toBe(repository.connections);
  });

  it('forwards the identifier when getting a connection', async () => {
    const repository = new FakeConnectionRepository();

    const result = await createGetConnectionUseCase(repository)('id/with space');

    expect(repository.gotId).toBe('id/with space');
    expect(result).toBe(connection);
  });

  it('normalizes URL details before testing an unsaved connection', async () => {
    const repository = new FakeConnectionRepository();

    const result = await createTestUnsavedConnectionUseCase(repository)({
      kind: 'url',
      connectionUrl: ' postgresql://loader:secret@db.internal/analytics ',
    });

    expect(repository.testedUnsaved).toEqual({
      kind: 'url',
      connectionUrl: 'postgresql://loader:secret@db.internal/analytics',
    });
    expect(result).toBe(verification);
  });

  it('forwards the identifier when testing a saved connection', async () => {
    const repository = new FakeConnectionRepository();

    const result = await createTestSavedConnectionUseCase(repository)('connection-1');

    expect(repository.testedSavedId).toBe('connection-1');
    expect(result).toBe(verification);
  });

  it('normalizes structured input before create', async () => {
    const repository = new FakeConnectionRepository();
    const create = createCreateConnectionUseCase(repository);

    const result = await create({
      name: ' Warehouse ',
      details: {
        kind: 'structured',
        host: ' db.internal ',
        port: 5432,
        databaseName: ' analytics ',
        username: ' loader ',
        password: ' secret ',
        sslMode: 'require',
        applicationName: ' celesnity ',
      },
    });

    expect(repository.created).toEqual({
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
    });
    expect(result).toBe(connection);
  });

  it('normalizes URL input before update and forwards its identifier', async () => {
    const repository = new FakeConnectionRepository();

    const result = await createUpdateConnectionUseCase(repository)('connection-1', {
      name: ' Warehouse ',
      details: {
        kind: 'url',
        connectionUrl: ' postgresql://loader:secret@db.internal/analytics ',
      },
    });

    expect(repository.updated).toEqual({
      id: 'connection-1',
      input: {
        name: 'Warehouse',
        details: {
          kind: 'url',
          connectionUrl: 'postgresql://loader:secret@db.internal/analytics',
        },
      },
    });
    expect(result).toBe(connection);
  });

  it('preserves the old optional structured field semantics', async () => {
    const repository = new FakeConnectionRepository();

    await createCreateConnectionUseCase(repository)({
      name: 'Warehouse',
      details: {
        kind: 'structured',
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'loader',
        password: '',
        sslMode: 'require',
        applicationName: '   ',
      },
    });

    expect(repository.created).toEqual({
      name: 'Warehouse',
      details: {
        kind: 'structured',
        host: 'db.internal',
        port: 5432,
        databaseName: 'analytics',
        username: 'loader',
        sslMode: 'require',
        applicationName: '',
      },
    });
  });

  it('forwards the identifier when archiving a connection', async () => {
    const repository = new FakeConnectionRepository();

    await createArchiveConnectionUseCase(repository)('connection-1');

    expect(repository.archivedId).toBe('connection-1');
  });
});
